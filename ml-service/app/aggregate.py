"""Market aggregation (pandas): skill demand counts and salary statistics for a set of listings."""
from collections import Counter

import pandas as pd

from . import skills as skills_mod
from .adzuna import Listing


def aggregate(listings: list[Listing]) -> dict:
    n = len(listings)
    per_listing = [skills_mod.extract_skills(job.text) for job in listings]
    counts = Counter(s for sk in per_listing for s in sk)  # each listing counts a skill at most once

    rows = []
    for job in listings:
        vals = [v for v in (job.salary_min, job.salary_max) if v is not None and v > 0]
        if vals:
            rows.append({"salary": sum(vals) / len(vals), "predicted": job.salary_predicted, "currency": job.currency})
    salary = None
    predicted_share = None
    if rows:
        df = pd.DataFrame(rows)
        s = df["salary"]
        salary = {
            "count": int(s.count()), "min": float(s.min()), "max": float(s.max()), "mean": float(s.mean()),
            "median": float(s.median()), "p25": float(s.quantile(0.25)), "p75": float(s.quantile(0.75)),
            "currency": str(df["currency"].mode().iat[0]) if df["currency"].astype(bool).any() else "",
        }
        predicted_share = float(df["predicted"].mean())
    return {
        "n": n,
        "skill_counts": dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))),
        "salary": salary,
        "salary_predicted_share": predicted_share,
        "listing_skills": [sorted(sk) for sk in per_listing],
    }
