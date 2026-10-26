import httpx
import pytest
from app import adzuna, aggregate, gemini, roadmap, skills
from app.adzuna import Listing
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)
H = {"x-ml-secret": "s3cret"}


def L(i, text, lo=None, hi=None, pred=False, cur="INR"):
    return Listing(source_id=str(i), title="Role", company="Co", location="X", description=text, url="https://x",
                   salary_min=lo, salary_max=hi, salary_predicted=pred, currency=cur)


class TestSkills:
    def test_aliases_plurals_and_multiword(self):
        got = skills.extract_skills("Machine-Learning, pytorch, Postgres, k8s, REST APIs, CI/CD, C++, Node.js, golang, Power BI")
        assert {"Machine Learning", "PyTorch", "PostgreSQL", "Kubernetes", "REST APIs", "CI/CD", "C++", "Node.js", "Go", "Power BI"} <= got

    def test_does_not_match_inside_words_or_generic_text(self):
        assert skills.extract_skills("We build great things in a friendly team and go to lunch") == set()
        assert "Java" not in skills.extract_skills("Experience with JavaScript")
        assert "Git" not in skills.extract_skills("digital marketing gitless")

    def test_longest_match_wins(self):
        got = skills.extract_skills("react native developer")
        assert "React Native" in got and "React" not in got

    def test_ml_and_ai_short_tokens(self):
        assert "Machine Learning" in skills.extract_skills("ML engineer")


class TestAggregate:
    def test_counts_each_skill_once_per_listing(self):
        ls = [L(1, "Python python PYTHON and SQL"), L(2, "Python only"), L(3, "Excel work")]
        a = aggregate.aggregate(ls)
        assert a["n"] == 3
        assert a["skill_counts"]["Python"] == 2 and a["skill_counts"]["SQL"] == 1 and a["skill_counts"]["Excel"] == 1
        assert list(a["skill_counts"])[0] == "Python"  # sorted by count desc

    def test_salary_statistics_use_midpoints_and_ignore_missing(self):
        ls = [L(1, "x", 100, 200), L(2, "x", 300, 300, pred=True), L(3, "x", None, 500), L(4, "x"), L(5, "x", 0, 0)]
        s = aggregate.aggregate(ls)
        sal = s["salary"]
        assert sal["count"] == 3 and sal["min"] == 150 and sal["max"] == 500 and sal["median"] == 300
        assert sal["mean"] == pytest.approx((150 + 300 + 500) / 3) and sal["currency"] == "INR"
        assert sal["p25"] == pytest.approx(225) and sal["p75"] == pytest.approx(400)
        assert s["salary_predicted_share"] == pytest.approx(1 / 3)

    def test_no_salaries_and_empty(self):
        assert aggregate.aggregate([L(1, "x")])["salary"] is None
        e = aggregate.aggregate([])
        assert e["n"] == 0 and e["skill_counts"] == {}


class TestRoadmap:
    COUNTS = {"Python": 8, "SQL": 5, "Docker": 3, "Kafka": 1, "AWS": 3}

    def test_demand_threshold_is_inclusive_and_gap_sorted_by_demand(self):
        gap, covered = roadmap.build_gap(self.COUNTS, 10, 0.3, {"Python"})
        assert [g["skill"] for g in gap] == ["SQL", "AWS", "Docker"]  # d: .5, .3, .3 (ties alphabetical); Kafka .1 < tau
        assert gap[0] == {"skill": "SQL", "count": 5, "demand": 0.5}
        assert [c["skill"] for c in covered] == ["Python"]

    def test_user_skills_remove_items(self):
        gap, _ = roadmap.build_gap(self.COUNTS, 10, 0.1, {"Python", "SQL", "Docker", "AWS", "Kafka"})
        assert gap == []

    def test_n_zero(self):
        assert roadmap.build_gap({"Python": 3}, 0, 0.1, set()) == ([], [])

    def test_build_roadmap_extracts_user_skills_from_text_and_uses_template_without_gemini(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        r = roadmap.build_roadmap("Backend Developer", ["postgres"], "Built services in Python and Docker", self.COUNTS, 10, 0.1)
        assert {"Python", "Docker", "PostgreSQL"} <= set(r["user_skills"])
        assert [i["skill"] for i in r["items"]] == ["SQL", "AWS", "Kafka"]
        assert all(i["guidance_source"] == "template" and i["skill"] in i["guidance"] for i in r["items"])
        assert r["role_skill_count"] == 5

    def test_gemini_guidance_gets_only_role_and_skill_names(self, monkeypatch):
        seen = {}

        def fake(prompt, **kw):
            seen["p"] = prompt
            return '```json\n{"SQL": "Learn joins first.", "AWS": ""}\n```'

        monkeypatch.setattr(gemini, "generate", fake)
        r = roadmap.build_roadmap("Backend Developer", [], "my private resume text about Acme Corp", self.COUNTS, 10, 0.3)
        by = {i["skill"]: i for i in r["items"]}
        assert by["SQL"]["guidance"] == "Learn joins first." and by["SQL"]["guidance_source"] == "gemini"
        assert by["AWS"]["guidance_source"] == "template"  # blank LLM answer falls back
        assert "Backend Developer" in seen["p"] and "SQL" in seen["p"]
        assert "Acme" not in seen["p"] and "private resume" not in seen["p"]

    def test_garbage_gemini_output_falls_back(self, monkeypatch):
        monkeypatch.setattr(gemini, "generate", lambda p, **kw: "sorry, I can't")
        r = roadmap.build_roadmap("Dev", [], "", self.COUNTS, 10, 0.5)
        assert all(i["guidance_source"] == "template" for i in r["items"])

    def test_items_are_capped(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        counts = {f"Skill{i:02d}": 10 for i in range(40)}
        assert len(roadmap.build_roadmap("Dev", [], "", counts, 10, 0.1)["items"]) == roadmap.MAX_ITEMS


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("ML_SHARED_SECRET", "s3cret")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)


def test_roadmap_endpoint(env):
    body = {"role": "Backend Developer", "user_skills": ["Python"], "skill_counts": {"Python": 8, "SQL": 5}, "n": 10, "tau": 0.1}
    assert client.post("/roadmap", json=body).status_code == 401
    r = client.post("/roadmap", json=body, headers=H).json()
    assert [i["skill"] for i in r["items"]] == ["SQL"] and r["items"][0]["demand"] == 0.5
    assert client.post("/roadmap", json={**body, "tau": 0}, headers=H).status_code == 422
    assert client.post("/roadmap", json={**body, "n": 0}, headers=H).status_code == 422


def test_aggregate_endpoint(env, monkeypatch):
    payload = {"results": [
        {"id": "1", "title": "Python dev", "description": "Python and SQL on AWS", "redirect_url": "https://x/1", "salary_min": 100, "salary_max": 200,
         "company": {"display_name": "A"}, "location": {"display_name": "Pune"}},
        {"id": "2", "title": "Analyst", "description": "SQL, Excel, Tableau", "redirect_url": "https://x/2"},
    ]}
    monkeypatch.setenv("ADZUNA_APP_ID", "a")
    monkeypatch.setenv("ADZUNA_APP_KEY", "b")
    real = httpx.Client
    monkeypatch.setattr(adzuna.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload))))
    r = client.post("/aggregate", json={"what": "python", "where": "pune"}, headers=H).json()
    assert r["n"] == 2 and r["skill_counts"]["SQL"] == 2 and r["salary"]["median"] == 150
    assert {lst["source_id"] for lst in r["listings"]} == {"1", "2"} and r["listings"][0]["skills"]
    monkeypatch.delenv("ADZUNA_APP_KEY")
    assert client.post("/aggregate", json={"what": "python"}, headers=H).status_code == 503


def test_adzuna_pagination_stops_at_short_page_and_dedupes():
    pages = []

    def handler(req):
        page = int(str(req.url.path).rsplit("/", 1)[1])
        pages.append(page)
        ids = range(1, 51) if page == 1 else range(40, 60)  # page 2 overlaps and is short
        return httpx.Response(200, json={"results": [{"id": str(i), "title": "t"} for i in ids]})

    import os
    os.environ["ADZUNA_APP_ID"], os.environ["ADZUNA_APP_KEY"] = "a", "b"
    try:
        out = adzuna.search("x", "", pages=3, limit=50, client=httpx.Client(transport=httpx.MockTransport(handler)))
    finally:
        del os.environ["ADZUNA_APP_ID"], os.environ["ADZUNA_APP_KEY"]
    assert pages == [1, 2] and len(out) == 59


class TestAmbiguousWords:
    @pytest.mark.parametrize("text", ["ability to excel in a fast paced job", "we go to lunch", "in spring we hire", "to express interest", "rust on the pipes", "r u ready"])
    def test_common_words_do_not_match(self, text):
        assert skills.extract_skills(text) == set()

    @pytest.mark.parametrize("text,skill", [("SQL, Excel, Tableau", "Excel"), ("Rust and Go (golang)", "Rust"), ("Spring Boot", "Spring"), ("Swift developer", "Swift"), ("advanced excel", "Excel")])
    def test_skill_uses_do_match(self, text, skill):
        assert skill in skills.extract_skills(text)
