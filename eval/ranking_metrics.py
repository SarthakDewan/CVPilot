"""Precision@K and nDCG@K from a relevance CSV you supply.

Input CSV columns:
    query_id   identifies one search (e.g. one candidate profile)
    doc_id     the listing
    score      the system's score for that listing (higher = ranked earlier)
    relevance  your judgement (0 = irrelevant, higher = more relevant; graded 0-3 works well)
P@K counts an item as relevant when relevance >= --relevant-threshold (default 1). nDCG@K uses linear gain
and a log2 discount; queries with no relevant item are skipped for nDCG (undefined) and reported.
"""
import argparse
import sys
from pathlib import Path

import pandas as pd

from common import ROOT, require_file
from metrics import ndcg_at_k, precision_at_k

DEFAULT_CSV = ROOT / "eval" / "data" / "job_relevance.csv"


def evaluate(df: pd.DataFrame, ks: list[int], threshold: float) -> dict:
    out = {k: {"p": [], "ndcg": []} for k in ks}
    skipped = 0
    for _, g in df.groupby("query_id"):
        ranked = g.sort_values(["score", "doc_id"], ascending=[False, True])["relevance"].astype(float).tolist()
        if max(ranked) <= 0:
            skipped += 1
        for k in ks:
            out[k]["p"].append(precision_at_k(ranked, k, threshold))
            n = ndcg_at_k(ranked, k)
            if n is not None:
                out[k]["ndcg"].append(n)
    return {"queries": df["query_id"].nunique(), "no_relevant": skipped,
            "metrics": {k: {"P": sum(v["p"]) / len(v["p"]), "nDCG": (sum(v["ndcg"]) / len(v["ndcg"])) if v["ndcg"] else None} for k, v in out.items()}}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    ap.add_argument("--k", type=int, nargs="+", default=[5, 10])
    ap.add_argument("--relevant-threshold", type=float, default=1)
    a = ap.parse_args(argv)

    require_file(a.csv, "relevance judgements CSV", "Create it with columns query_id, doc_id, score, relevance; see eval/README.md.")
    df = pd.read_csv(a.csv)
    need = {"query_id", "doc_id", "score", "relevance"}
    if need - set(df.columns):
        print(f"CSV is missing columns: {sorted(need - set(df.columns))}", file=sys.stderr)
        return 2
    res = evaluate(df.dropna(subset=list(need)), a.k, a.relevant_threshold)
    print(f"queries={res['queries']} (no relevant item in {res['no_relevant']})")
    print(f"{'K':>4}{'P@K':>10}{'nDCG@K':>10}")
    for k, m in res["metrics"].items():
        nd = "n/a" if m["nDCG"] is None else f"{m['nDCG']:.4f}"
        print(f"{k:>4}{m['P']:>10.4f}{nd:>10}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
