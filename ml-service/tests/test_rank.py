import numpy as np
import pytest

from app import rank, scam
from app.adzuna import Listing


def L(i, text, title="Role"):
    return Listing(source_id=str(i), title=title, company="Co", location="Pune", description=text, url="https://x",
                   salary_min=None, salary_max=None, salary_predicted=False, currency="INR")


@pytest.fixture(autouse=True)
def clean():
    rank.clear_cache()
    yield
    rank.clear_cache()


class TestTopK:
    def test_matches_full_sort(self):
        rng = np.random.default_rng(0)
        scored = [(float(s), i) for i, s in enumerate(rng.random(200))]
        expected = sorted(scored, key=lambda t: (-t[0], t[1]))[:10]
        assert rank.top_k(scored, 10) == expected

    def test_k_larger_than_n_and_empty(self):
        assert rank.top_k([(0.5, 0), (0.9, 1)], 10) == [(0.9, 1), (0.5, 0)]
        assert rank.top_k([], 5) == []

    def test_ties_prefer_earlier_index(self):
        assert rank.top_k([(0.5, 0), (0.5, 1), (0.5, 2)], 2) == [(0.5, 0), (0.5, 1)]


class TestRank:
    PROFILE = "Python developer with Django and PostgreSQL experience building REST APIs"

    def test_orders_by_cosine_and_returns_k(self, fake_encoder):
        listings = [
            L(1, "Pastry chef needed for bakery kitchen croissants bread"),
            L(2, "Python Django developer to build REST APIs on PostgreSQL"),
            L(3, "Warehouse operator forklift driving shifts"),
        ]
        out = rank.rank(self.PROFILE, ["Python", "Django"], listings, 2, enc=fake_encoder)
        assert [r.listing.source_id for r in out][0] == "2"
        assert len(out) == 2
        assert out[0].score >= out[1].score
        assert {"Python", "Django"} <= set(out[0].matched_terms)

    def test_high_risk_listings_are_labelled_not_hidden(self, fake_encoder):
        scam_ad = ("Python Django developer, guaranteed placement, no interview. Pay a registration fee and "
                   "send your bank account details to hr@gmail.com")
        out = rank.rank(self.PROFILE, [], [L(1, scam_ad), L(2, "Python developer role at an established company")], 5, enc=fake_encoder)
        assert len(out) == 2
        by_id = {r.listing.source_id: r for r in out}
        assert by_id["1"].screening.band == "high" and len(by_id["1"].screening.fired) == 4
        assert by_id["2"].screening.band == "safe"

    def test_every_result_has_screening_and_mode(self, fake_encoder):
        out = rank.rank(self.PROFILE, [], [L(1, "a python job"), L(2, "another job")], 5, enc=fake_encoder)
        assert all(r.screening.mode == "rule-only" for r in out)

    def test_listing_embeddings_are_cached(self, fake_encoder):
        calls = []
        orig = fake_encoder.encode
        fake_encoder.encode = lambda texts: (calls.append(list(texts)), orig(texts))[1]
        listings = [L(1, "python job one"), L(2, "python job two")]
        rank.rank(self.PROFILE, [], listings, 2, enc=fake_encoder)
        rank.rank(self.PROFILE, [], listings, 2, enc=fake_encoder)
        assert len(calls[0]) == 3  # profile + 2 listings
        assert len(calls) == 1  # second run served entirely from cache

    def test_empty_listings(self, fake_encoder):
        assert rank.rank(self.PROFILE, [], [], 5, enc=fake_encoder) == []


def test_classifier_probability_flows_into_ranking(fake_encoder):
    class Always:
        def predict_proba(self, text):
            return 1.0

    out = rank.rank("python developer here", [], [L(1, "python job")], 1, enc=fake_encoder, classifier=Always(),
                    settings=scam.Settings(w_r=0.5))
    assert out[0].screening.mode == "hybrid" and out[0].screening.band == "high"
