"""Ranking metrics. Pure functions, unit-tested against hand-computed values."""
import math
from collections.abc import Sequence


def precision_at_k(relevances: Sequence[float], k: int, threshold: float = 1) -> float:
    """Share of the top-k ranked items with relevance >= threshold. Ranks beyond len(relevances) count as misses."""
    if k <= 0:
        raise ValueError("k must be positive")
    return sum(1 for r in list(relevances)[:k] if r >= threshold) / k


def dcg_at_k(relevances: Sequence[float], k: int) -> float:
    return sum(r / math.log2(i + 2) for i, r in enumerate(list(relevances)[:k]))


def ndcg_at_k(relevances: Sequence[float], k: int) -> float | None:
    """nDCG@k with linear gain; None when the query has no relevant item (undefined)."""
    ideal = dcg_at_k(sorted(relevances, reverse=True), k)
    return None if ideal == 0 else dcg_at_k(relevances, k) / ideal
