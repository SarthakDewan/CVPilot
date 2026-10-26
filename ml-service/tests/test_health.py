from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health_is_open():
    assert client.get("/health").json() == {"status": "ok", "service": "ml-service"}


def test_internal_route_requires_secret(monkeypatch):
    monkeypatch.setenv("ML_SHARED_SECRET", "s3cret")
    assert client.get("/internal/ping").status_code == 401
    assert client.get("/internal/ping", headers={"x-ml-secret": "wrong"}).status_code == 401
    assert client.get("/internal/ping", headers={"x-ml-secret": "s3cret"}).status_code == 200


def test_unset_secret_rejects_everything(monkeypatch):
    monkeypatch.delenv("ML_SHARED_SECRET", raising=False)
    assert client.get("/internal/ping", headers={"x-ml-secret": ""}).status_code == 401
