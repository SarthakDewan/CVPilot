"""Pipeline smoke tests. The CSVs here are tiny SYNTHETIC fixtures that only prove the scripts run; they say
nothing about model quality and their outputs are never reported as results."""
import numpy as np
import pandas as pd
import pytest

import ats_correlation
import ranking_metrics
import train_scam_classifier as train
from app import embeddings


def synthetic_emscad(n=400, seed=0):
    rng = np.random.default_rng(seed)
    legit = ["software engineer python django api team", "nurse hospital care patients shift", "accountant ledger audit tax finance"]
    fraud = ["earn money from home easy weekly pay no experience", "data entry typing home income quick cash"]
    rows = []
    for i in range(n):
        is_fraud = i % 10 == 0
        base = fraud if is_fraud else legit
        words = " ".join(rng.choice(base, 3)) + f" extra{i % 7}"
        rows.append({"title": words.split()[0], "description": words, "requirements": words, "benefits": "", "fraudulent": int(is_fraud)})
    return pd.DataFrame(rows)


def test_missing_dataset_prints_clear_message_and_exits(tmp_path, capsys):
    with pytest.raises(SystemExit) as e:
        train.main(["--data", str(tmp_path / "nope.csv"), "--no-save"])
    assert e.value.code == 2
    err = capsys.readouterr().err
    assert "MISSING INPUT" in err and "none are invented" in err


def test_training_pipeline_runs_and_writes_artifacts(tmp_path, capsys):
    csv = tmp_path / "d.csv"
    synthetic_emscad().to_csv(csv, index=False)
    out = tmp_path / "models"
    assert train.main(["--data", str(csv), "--out", str(out)]) == 0
    text = capsys.readouterr().out
    for variant in ("rule-only", "classifier-only", "hybrid + rule floor"):
        assert variant in text
    assert (out / "scam_clf.joblib").exists() and (out / "scam_settings.json").exists() and (out / "scam_clf.metrics.json").exists()

    import joblib

    model = joblib.load(out / "scam_clf.joblib")
    p = model.predict_proba(["earn money from home easy weekly pay"])[0][1]
    assert 0 <= p <= 1


def test_splits_are_stratified_and_disjoint():
    df = synthetic_emscad()
    y = df.fraudulent.to_numpy()
    tr, va, te = train.split(df, y, 1)
    assert not (set(tr) & set(va)) and not (set(tr) & set(te)) and not (set(va) & set(te))
    assert len(tr) + len(va) + len(te) == len(df)
    for part in (tr, va, te):
        assert abs(y[part].mean() - y.mean()) < 0.02


def test_threshold_helpers():
    y = np.array([0, 0, 1, 1, 0, 1])
    r = np.array([0.1, 0.2, 0.8, 0.9, 0.3, 0.4])
    cut, f1 = train.best_f1_threshold(y, r)
    assert f1 == pytest.approx(1.0) and 0.4 <= cut <= 0.8
    assert train.recall_threshold(y, r, 1.0) == pytest.approx(0.4)


def test_ats_correlation_missing_file(tmp_path, capsys):
    with pytest.raises(SystemExit) as e:
        ats_correlation.main(["--csv", str(tmp_path / "x.csv")])
    assert e.value.code == 2 and "MISSING INPUT" in capsys.readouterr().err


def test_ats_correlation_runs_with_a_fake_encoder(tmp_path, capsys, monkeypatch):
    import hashlib

    class Enc:
        name = "fake"

        def encode(self, texts):
            out = np.zeros((len(texts), 64))
            for i, t in enumerate(texts):
                for w in t.lower().split():
                    out[i, int(hashlib.md5(w.encode()).hexdigest(), 16) % 64] += 1
            return out / np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-9)

    monkeypatch.setattr(embeddings, "get_encoder", lambda: Enc())
    rows = [{"resume_text": f"python sql skill{i} docker", "job_text": f"python sql role{i} kubernetes" if i % 2 else f"chef bakery bread{i}", "human_score": 5 if i % 2 else 1}
            for i in range(12)]
    csv = tmp_path / "r.csv"
    pd.DataFrame(rows).to_csv(csv, index=False)
    assert ats_correlation.main(["--csv", str(csv)]) == 0
    out = capsys.readouterr().out
    assert "TF-IDF cosine" in out and "Token overlap" in out and "Spearman" in out


def test_ats_correlation_needs_enough_rows(tmp_path, capsys):
    csv = tmp_path / "r.csv"
    pd.DataFrame([{"resume_text": "a b c", "job_text": "a b", "human_score": 3}]).to_csv(csv, index=False)
    assert ats_correlation.main(["--csv", str(csv)]) == 2


def test_ranking_metrics_script(tmp_path, capsys):
    csv = tmp_path / "rel.csv"
    pd.DataFrame([
        {"query_id": "q1", "doc_id": "a", "score": 0.9, "relevance": 3},
        {"query_id": "q1", "doc_id": "b", "score": 0.8, "relevance": 0},
        {"query_id": "q1", "doc_id": "c", "score": 0.1, "relevance": 2},
        {"query_id": "q2", "doc_id": "a", "score": 0.5, "relevance": 0},
        {"query_id": "q2", "doc_id": "b", "score": 0.4, "relevance": 0},
    ]).to_csv(csv, index=False)
    assert ranking_metrics.main(["--csv", str(csv), "--k", "1", "3"]) == 0
    out = capsys.readouterr().out
    assert "queries=2 (no relevant item in 1)" in out
    res = ranking_metrics.evaluate(pd.read_csv(csv), [1, 3], 1)
    assert res["metrics"][1]["P"] == pytest.approx(0.5)  # q1 top hit relevant, q2 not
    assert res["metrics"][1]["nDCG"] == pytest.approx(1 / 1.0 * (3 / 3))  # q1 only (q2 undefined)
    assert res["metrics"][3]["P"] == pytest.approx((2 / 3 + 0) / 2)


def test_ranking_metrics_missing_file_and_columns(tmp_path, capsys):
    with pytest.raises(SystemExit):
        ranking_metrics.main(["--csv", str(tmp_path / "none.csv")])
    bad = tmp_path / "bad.csv"
    pd.DataFrame([{"query_id": 1}]).to_csv(bad, index=False)
    assert ranking_metrics.main(["--csv", str(bad)]) == 2
