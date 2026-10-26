import httpx
import pytest
from fastapi.testclient import TestClient

from app import adzuna, scam
from app.main import app
from tests.test_adzuna import PAYLOAD

client = TestClient(app)
H = {"x-ml-secret": "s3cret"}


@pytest.fixture(autouse=True)
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("ML_SHARED_SECRET", "s3cret")
    monkeypatch.setenv("SCAM_MODEL_PATH", str(tmp_path / "none.joblib"))
    scam.reset_caches()
    yield
    scam.reset_caches()


def test_screen_requires_secret_and_validates():
    assert client.post("/screen", json={"text": "x" * 30}).status_code == 401
    assert client.post("/screen", json={"text": "short"}, headers=H).status_code == 422


def test_screen_returns_evidence_and_mode():
    body = client.post("/screen", json={"text": "Pay a registration fee. Email jobs@gmail.com to apply today."}, headers=H).json()
    assert body["mode"] == "rule-only" and body["p_clf"] is None
    assert body["band"] == "high" and body["risk"] == 0.5
    assert [f["id"] for f in body["fired"]] == ["h1", "h4"]
    assert len(body["checked"]) == 4


def test_rank_503_without_adzuna_keys(monkeypatch):
    monkeypatch.delenv("ADZUNA_APP_ID", raising=False)
    r = client.post("/rank", json={"profile_text": "python developer", "what": "python"}, headers=H)
    assert r.status_code == 503 and "Adzuna is not configured" in r.json()["detail"]


def test_rank_end_to_end_with_mocked_adzuna(monkeypatch, fake_encoder):
    monkeypatch.setenv("ADZUNA_APP_ID", "a")
    monkeypatch.setenv("ADZUNA_APP_KEY", "b")
    real = httpx.Client
    monkeypatch.setattr(adzuna.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=PAYLOAD))))
    r = client.post("/rank", json={"profile_text": "Python developer Django APIs", "profile_skills": ["Python"], "what": "python", "k": 5}, headers=H)
    assert r.status_code == 200
    body = r.json()
    assert body["fetched"] == 2 and body["mode"] == "rule-only"
    first = body["results"][0]
    assert first["title"] == "Python Developer" and first["company"] == "Acme Tech"
    assert set(first) >= {"score", "cosine", "matched_terms", "scam", "salary_min", "url", "source_id"}
    assert first["scam"]["band"] == "safe"


def test_rank_adzuna_failure_is_502(monkeypatch, fake_encoder):
    monkeypatch.setenv("ADZUNA_APP_ID", "a")
    monkeypatch.setenv("ADZUNA_APP_KEY", "b")
    real = httpx.Client
    monkeypatch.setattr(adzuna.httpx, "Client", lambda **kw: real(transport=httpx.MockTransport(lambda r: httpx.Response(500))))
    assert client.post("/rank", json={"profile_text": "python developer", "what": "python"}, headers=H).status_code == 502
