"""Train and evaluate the scam classifier on EMSCAD, and tune the hybrid fusion.

Data: the "Real / Fake Job Posting Prediction" CSV (EMSCAD). Download it yourself and place it at
eval/data/fake_job_postings.csv (see eval/README.md).

Method (all choices are made on the validation split only; the test split is touched once, at the end):
  1. Stratified split 60/20/20 into train / validation / test.
  2. TF-IDF (1-2 grams) + logistic regression with class_weight="balanced"; C chosen on validation AUC-PR.
  3. Rule score rho from the same data-driven rules the service uses.
  4. Fusion weight w_r (w_c = 1 - w_r) chosen on validation AUC-PR of r = w_r*rho + w_c*P_clf.
  5. Thresholds: theta2 = validation-F1-optimal cut for r; theta1 = highest cut that still has validation recall >= 0.90.
  6. Test report for rule-only vs classifier-only vs hybrid. Every number printed is computed here.

The text used excludes `company_profile`: job-board snippets (what the app sees from Adzuna) have no such field.
"""
import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, f1_score, precision_recall_curve, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from common import ML_SERVICE, ROOT, require_file

from app import scam  # noqa: E402  (path set up by common)

TEXT_FIELDS = ["title", "description", "requirements", "benefits"]
DEFAULT_DATA = ROOT / "eval" / "data" / "fake_job_postings.csv"


def build_text(df: pd.DataFrame, fields=TEXT_FIELDS) -> pd.Series:
    return df[fields].fillna("").astype(str).agg("\n".join, axis=1)


def split(df: pd.DataFrame, y: np.ndarray, seed: int):
    idx = np.arange(len(df))
    train, rest = train_test_split(idx, test_size=0.4, stratify=y, random_state=seed)
    val, test = train_test_split(rest, test_size=0.5, stratify=y[rest], random_state=seed)
    return train, val, test


def best_f1_threshold(y: np.ndarray, r: np.ndarray) -> tuple[float, float]:
    prec, rec, thr = precision_recall_curve(y, r)
    f1 = 2 * prec[:-1] * rec[:-1] / np.maximum(prec[:-1] + rec[:-1], 1e-12)
    i = int(np.argmax(f1))
    return float(thr[i]), float(f1[i])


def recall_threshold(y: np.ndarray, r: np.ndarray, target: float) -> float:
    """Largest cut with recall >= target (flagging r >= cut)."""
    _, rec, thr = precision_recall_curve(y, r)
    ok = [t for t, rc in zip(thr, rec[:-1], strict=True) if rc >= target]
    return float(max(ok)) if ok else float(thr[0])


def report(y: np.ndarray, r: np.ndarray, cut: float) -> dict:
    pred = (r >= cut).astype(int)
    return {
        "threshold": round(cut, 4),
        "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y, pred, zero_division=0)), 4),
        "auc_roc": round(float(roc_auc_score(y, r)), 4),
        "auc_pr": round(float(average_precision_score(y, r)), 4),
    }


def rho_scores(texts: pd.Series) -> np.ndarray:
    rs = scam.load_rules()
    return np.array([scam.rule_score(t, rs)[0] for t in texts])


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA)
    ap.add_argument("--out", type=Path, default=ML_SERVICE / "models")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--no-save", action="store_true", help="evaluate only; do not write model files")
    a = ap.parse_args(argv)

    require_file(a.data, "EMSCAD dataset CSV (fake_job_postings.csv)",
                 "Download 'Real / Fake Job Posting Prediction' (EMSCAD) and place the CSV there; see eval/README.md.")
    df = pd.read_csv(a.data)
    missing = [c for c in TEXT_FIELDS + ["fraudulent"] if c not in df.columns]
    if missing:
        print(f"Dataset is missing expected columns: {missing}", file=sys.stderr)
        return 2
    y = df["fraudulent"].astype(int).to_numpy()
    text = build_text(df)
    tr, va, te = split(df, y, a.seed)
    print(f"rows={len(df)} fraud={int(y.sum())} ({y.mean():.1%}) | train={len(tr)} val={len(va)} test={len(te)}")

    # --- classifier: choose C on validation AUC-PR
    best = None
    for C in (1, 3, 10, 30, 100):
        pipe = Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=3, max_df=0.9, sublinear_tf=True, stop_words="english", max_features=200_000)),
            ("lr", LogisticRegression(C=C, class_weight="balanced", max_iter=2000)),
        ])
        pipe.fit(text.iloc[tr], y[tr])
        ap_val = average_precision_score(y[va], pipe.predict_proba(text.iloc[va])[:, 1])
        print(f"  C={C:<4} validation AUC-PR={ap_val:.4f}")
        if best is None or ap_val > best[0]:
            best = (ap_val, C, pipe)
    _, C, pipe = best
    p = {k: pipe.predict_proba(text.iloc[i])[:, 1] for k, i in (("val", va), ("test", te))}
    rho = {k: rho_scores(text.iloc[i]) for k, i in (("val", va), ("test", te))}

    # --- fusion weight on validation
    grid = np.round(np.linspace(0, 1, 11), 1)
    ap_by_w = {float(w): average_precision_score(y[va], w * rho["val"] + (1 - w) * p["val"]) for w in grid}
    w_r = max(ap_by_w, key=ap_by_w.get)
    print(f"chosen C={C}, w_r={w_r} (validation AUC-PR by w_r: " + ", ".join(f"{w:.1f}:{v:.3f}" for w, v in ap_by_w.items()) + ")")

    fused = {k: w_r * rho[k] + (1 - w_r) * p[k] for k in ("val", "test")}
    deployed = {k: np.maximum(fused[k], rho[k]) for k in fused}  # rule floor, as in app.scam.fuse
    variants = {"rule-only": "rho", "classifier-only": "p", "hybrid (plain formula)": "fused", "hybrid + rule floor": "deployed"}
    series = {"rho": rho, "p": p, "fused": fused, "deployed": deployed}
    fire = rho["val"] > 0
    print(f"rule diagnostics (validation): any rule fires on {np.mean(fire[y[va] == 1]):.2%} of fraud and "
          f"{np.mean(fire[y[va] == 0]):.2%} of legitimate postings")
    if w_r == 0:
        print("note: validation chose w_r=0, so the plain hybrid equals the classifier alone on this dataset")

    # --- thresholds on validation only
    theta2, val_f1 = best_f1_threshold(y[va], deployed["val"])
    theta1 = min(recall_threshold(y[va], deployed["val"], 0.90), theta2)
    if theta1 >= theta2:
        theta1 = theta2 / 2
    print(f"tuned on validation: theta1={theta1:.4f} (recall>=0.90 cut), theta2={theta2:.4f} (F1-optimal, val F1={val_f1:.3f})")

    # --- test report (each variant uses its own validation-F1-optimal cut)
    print("\nTEST SET (never used for tuning), fraud class = positive")
    print(f"{'variant':<24}{'thr':>8}{'precision':>11}{'recall':>9}{'F1':>8}{'AUC-ROC':>10}{'AUC-PR':>9}")
    results = {}
    for name, key in variants.items():
        cut, _ = best_f1_threshold(y[va], series[key]["val"])
        r = report(y[te], series[key]["test"], cut)
        results[name] = r
        print(f"{name:<24}{r['threshold']:>8}{r['precision']:>11}{r['recall']:>9}{r['f1']:>8}{r['auc_roc']:>10}{r['auc_pr']:>9}")
    prev = float(y[te].mean())
    print(f"(fraud prevalence in test = {prev:.4f}; a no-skill AUC-PR equals this)")

    bands = {}
    s = scam.Settings(theta1=theta1, theta2=theta2, w_r=w_r, rule_floor=True)
    labels = np.array([scam.band_for(v, s) for v in deployed["test"]])
    for b in ("safe", "caution", "high"):
        m = labels == b
        bands[b] = {"n": int(m.sum()), "fraud_rate": round(float(y[te][m].mean()), 4) if m.any() else None}
    print("deployed bands on test (hybrid + rule floor, tuned thresholds):", json.dumps(bands))

    if not a.no_save:
        a.out.mkdir(parents=True, exist_ok=True)
        joblib.dump(pipe, a.out / "scam_clf.joblib")
        (a.out / "scam_settings.json").write_text(json.dumps({"theta1": round(theta1, 4), "theta2": round(theta2, 4), "w_r": w_r}, indent=2))
        (a.out / "scam_clf.metrics.json").write_text(json.dumps(
            {"data": str(a.data.name), "rows": len(df), "seed": a.seed, "text_fields": TEXT_FIELDS, "C": C, "w_r": w_r,
             "test": results, "bands_test": bands,
             "rule_fire_rate_validation": {"fraud": float(np.mean(fire[y[va] == 1])), "legit": float(np.mean(fire[y[va] == 0]))}}, indent=2))
        print(f"\nsaved model + settings + metrics to {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
