import httpx
import pytest
from app import adzuna

PAYLOAD = {
    "count": 2,
    "results": [
        {"id": "4001", "title": "Python Developer", "description": "Build APIs with Django.",
         "redirect_url": "https://www.adzuna.in/land/ad/4001", "created": "2026-10-20T10:00:00Z",
         "company": {"display_name": "Acme Tech"}, "location": {"display_name": "Bengaluru, Karnataka", "area": ["India"]},
         "salary_min": 600000, "salary_max": 900000, "salary_is_predicted": "1"},
        {"id": "4002", "title": "Data Analyst", "description": "SQL and dashboards.", "redirect_url": "https://x/4002"},
        {"title": "No id so skipped"},
    ],
}


def client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


@pytest.fixture(autouse=True)
def keys(monkeypatch):
    monkeypatch.setenv("ADZUNA_APP_ID", "id123")
    monkeypatch.setenv("ADZUNA_APP_KEY", "key456")
    monkeypatch.delenv("ADZUNA_COUNTRY", raising=False)


def test_parses_results_and_defaults_to_india():
    seen = {}

    def handler(req):
        seen["url"], seen["q"] = str(req.url.copy_with(query=None)), dict(req.url.params)
        return httpx.Response(200, json=PAYLOAD)

    out = adzuna.search("python developer", "Bengaluru", limit=20, client=client(handler))
    assert seen["url"] == "https://api.adzuna.com/v1/api/jobs/in/search/1"
    assert seen["q"]["what"] == "python developer" and seen["q"]["where"] == "Bengaluru"
    assert seen["q"]["results_per_page"] == "20" and seen["q"]["app_id"] == "id123"
    assert [lst.source_id for lst in out] == ["4001", "4002"]
    a, b = out
    assert (a.company, a.location, a.salary_min, a.salary_max, a.salary_predicted, a.currency) == (
        "Acme Tech", "Bengaluru, Karnataka", 600000.0, 900000.0, True, "INR")
    assert b.company == "" and b.salary_min is None and b.salary_predicted is False


def test_country_is_configurable(monkeypatch):
    monkeypatch.setenv("ADZUNA_COUNTRY", "gb")
    urls = []
    adzuna.search("x", "", client=client(lambda r: (urls.append(str(r.url)), httpx.Response(200, json={"results": []}))[1]))
    assert "/jobs/gb/search/1" in urls[0] and "where=" not in urls[0]


def test_limit_is_clamped_to_adzuna_maximum():
    q = {}
    adzuna.search("x", "y", limit=500, client=client(lambda r: (q.update(dict(r.url.params)), httpx.Response(200, json={}))[1]))
    assert q["results_per_page"] == "50"


def test_not_configured(monkeypatch):
    monkeypatch.delenv("ADZUNA_APP_KEY")
    with pytest.raises(adzuna.AdzunaNotConfigured):
        adzuna.search("x", "y")


@pytest.mark.parametrize("handler", [
    lambda r: httpx.Response(401, json={"error": "bad"}),
    lambda r: httpx.Response(200, text="not json"),
    lambda r: (_ for _ in ()).throw(httpx.ConnectError("boom")),
])
def test_errors_become_adzuna_error_without_leaking_the_api_key(handler):
    with pytest.raises(adzuna.AdzunaError) as e:
        adzuna.search("x", "y", client=client(handler))
    assert "key456" not in str(e.value) and "key456" not in repr(e.value.__cause__)


def test_base_url_override(monkeypatch):
    monkeypatch.setenv("ADZUNA_BASE_URL", "http://localhost:9999/jobs/")
    urls = []
    adzuna.search("x", "", client=client(lambda r: (urls.append(str(r.url)), httpx.Response(200, json={}))[1]))
    assert urls[0].startswith("http://localhost:9999/jobs/in/search/1")
