import pytest
from fastapi.testclient import TestClient

from app import gemini, suggest
from app.main import app

client = TestClient(app)
H = {"x-ml-secret": "s3cret"}
BODY = {"kind": "bullet", "text": "worked on the compiler thing for the team"}


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("ML_SHARED_SECRET", "s3cret")


def test_requires_secret():
    assert client.post("/suggest", json=BODY).status_code == 401


def test_validates_input():
    assert client.post("/suggest", json={"kind": "bullet", "text": "short"}, headers=H).status_code == 422
    assert client.post("/suggest", json={"kind": "poem", "text": "x" * 20}, headers=H).status_code == 422


def test_unconfigured_gemini_returns_503(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = client.post("/suggest", json=BODY, headers=H)
    assert r.status_code == 503
    assert "not configured" in r.json()["detail"]


def test_returns_parsed_suggestions(monkeypatch):
    seen = {}

    def fake(prompt, **kw):
        seen["prompt"] = prompt
        return "1. Built the compiler\n- Developed compiler tooling\n\n* Shipped a compiler\n4. extra"

    monkeypatch.setattr(gemini, "generate", fake)
    r = client.post("/suggest", json=BODY, headers=H)
    assert r.status_code == 200
    assert r.json()["suggestions"] == ["Built the compiler", "Developed compiler tooling", "Shipped a compiler"]
    assert BODY["text"] in seen["prompt"] and "Do NOT invent" in seen["prompt"]


def test_gemini_failure_is_502(monkeypatch):
    def boom(prompt, **kw):
        raise gemini.GeminiError("x")

    monkeypatch.setattr(gemini, "generate", boom)
    assert client.post("/suggest", json=BODY, headers=H).status_code == 502


def test_parse_suggestions_limit():
    assert suggest.parse_suggestions("a\nb\nc\nd", 2) == ["a", "b"]
