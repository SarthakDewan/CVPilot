from app import scam
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_status_reports_booleans_only(monkeypatch, tmp_path):
    monkeypatch.setenv("ML_SHARED_SECRET", "s3cret")
    monkeypatch.setenv("SCAM_MODEL_PATH", str(tmp_path / "none.joblib"))
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("ADZUNA_APP_ID", "id")
    monkeypatch.setenv("ADZUNA_APP_KEY", "super-secret-key")
    scam.reset_caches()
    assert client.get("/internal/status").status_code == 401
    r = client.get("/internal/status", headers={"x-ml-secret": "s3cret"})
    assert r.json() == {"classifier": False, "gemini": False, "adzuna": True, "embedding_model": "all-MiniLM-L6-v2"}
    assert "super-secret-key" not in r.text
    scam.reset_caches()
