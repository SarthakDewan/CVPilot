"""Spearman correlation between ATS scores and human ratings, vs TF-IDF cosine and token-overlap baselines.

Input CSV (you supply it; columns are configurable):
    resume_text, job_text, human_score
Each row is one resume/job pair with a human rating of how well the resume fits the job (any numeric scale).
"""
import argparse
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.feature_extraction.text import TfidfVectorizer

from common import ROOT, require_file

from app import embeddings  # noqa: E402

DEFAULT_CSV = ROOT / "eval" / "data" / "ats_human_ratings.csv"


def token_overlap(a: str, b: str) -> float:
    """Jaccard overlap of lower-cased alphanumeric tokens (3+ chars)."""
    ta, tb = (set(w for w in re.findall(r"[a-z0-9]+", t.lower()) if len(w) >= 3) for t in (a, b))
    return len(ta & tb) / len(ta | tb) if ta | tb else 0.0


def tfidf_cosine(resumes: list[str], jobs: list[str]) -> np.ndarray:
    vec = TfidfVectorizer(stop_words="english", sublinear_tf=True).fit(resumes + jobs)
    r, j = vec.transform(resumes), vec.transform(jobs)
    return np.asarray(r.multiply(j).sum(axis=1)).ravel()  # rows are L2-normalised, so the dot product is the cosine


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    ap.add_argument("--resume-col", default="resume_text")
    ap.add_argument("--job-col", default="job_text")
    ap.add_argument("--rating-col", default="human_score")
    a = ap.parse_args(argv)

    require_file(a.csv, "CSV of human ratings for resume/job pairs",
                 f"Create it with columns {a.resume_col}, {a.job_col}, {a.rating_col}; see eval/README.md.")
    df = pd.read_csv(a.csv).dropna(subset=[a.resume_col, a.job_col, a.rating_col])
    if len(df) < 10:
        print(f"Only {len(df)} usable rows; need at least 10 for a meaningful correlation.", file=sys.stderr)
        return 2
    resumes, jobs = df[a.resume_col].astype(str).tolist(), df[a.job_col].astype(str).tolist()
    human = df[a.rating_col].astype(float).to_numpy()

    enc = embeddings.get_encoder()
    ours = np.array([embeddings.match_score(embeddings.cosine(r, j)) for r, j in zip(enc.encode(resumes), enc.encode(jobs), strict=True)])
    scores = {
        f"CVPilot ATS score ({enc.name})": ours,
        "TF-IDF cosine": tfidf_cosine(resumes, jobs),
        "Token overlap (Jaccard)": np.array([token_overlap(r, j) for r, j in zip(resumes, jobs, strict=True)]),
    }
    print(f"n={len(df)} pairs\n{'method':<40}{'Spearman rho':>14}{'p-value':>12}")
    for name, s in scores.items():
        rho, p = spearmanr(s, human)
        print(f"{name:<40}{rho:>14.4f}{p:>12.4g}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
