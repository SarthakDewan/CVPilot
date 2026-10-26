import math

import pytest

from metrics import dcg_at_k, ndcg_at_k, precision_at_k


def test_precision_at_k_counts_relevant_in_top_k():
    assert precision_at_k([1, 0, 1, 0, 0], 3) == pytest.approx(2 / 3)
    assert precision_at_k([0, 0, 0], 3) == 0
    assert precision_at_k([3, 2, 1], 3) == 1
    # fewer results than k: missing ranks count as misses
    assert precision_at_k([1, 1], 4) == 0.5
    # graded relevance uses the threshold
    assert precision_at_k([3, 2, 1, 0], 4, threshold=2) == 0.5
    with pytest.raises(ValueError):
        precision_at_k([1], 0)


def test_ndcg_matches_hand_calculation():
    rels = [3, 2, 0, 1]
    dcg = 3 / math.log2(2) + 2 / math.log2(3) + 0 + 1 / math.log2(5)
    ideal = 3 / math.log2(2) + 2 / math.log2(3) + 1 / math.log2(4) + 0
    assert dcg_at_k(rels, 4) == pytest.approx(dcg)
    assert ndcg_at_k(rels, 4) == pytest.approx(dcg / ideal)
    assert ndcg_at_k([3, 2, 1, 0], 4) == pytest.approx(1.0)
    assert ndcg_at_k([0, 1, 2, 3], 4) < ndcg_at_k([3, 2, 1, 0], 4)


def test_ndcg_truncates_at_k_and_handles_no_relevant():
    assert ndcg_at_k([0, 0, 0], 3) is None
    assert ndcg_at_k([0, 0, 5], 1) == 0.0  # the relevant item is outside the top 1
