import numpy as np
import pytest
from app import embeddings, explain, gemini
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)
H = {"x-ml-secret": "s3cret"}
RESUME = "Python developer who builds REST APIs with SQL databases and Docker " * 2
JOB = "We need a Python engineer to build APIs, with SQL, Kubernetes and Terraform skills " * 2


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("ML_SHARED_SECRET", "s3cret")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)


class TestMatchScore:
    @pytest.mark.parametrize("cos,expected", [(1.0, 100), (0.0, 0), (-0.4, 0), (0.666, 67), (0.004, 0), (0.005, 0), (0.506, 51)])
    def test_rounds_and_clamps_at_zero(self, cos, expected):
        assert embeddings.match_score(cos) == expected

    def test_cosine_basic(self):
        a = np.array([1.0, 0.0])
        assert embeddings.cosine(a, a) == pytest.approx(1.0)
        assert embeddings.cosine(a, np.array([0.0, 1.0])) == pytest.approx(0.0)
        assert embeddings.cosine(a, np.array([-1.0, 0.0])) == pytest.approx(-1.0)
        assert embeddings.cosine(a, np.zeros(2)) == 0.0


class TestScoreEndpoint:
    def test_requires_secret(self, fake_encoder):
        assert client.post("/score", json={"resume_text": RESUME, "job_description": JOB}).status_code == 401

    def test_validates_input(self, fake_encoder):
        assert client.post("/score", json={"resume_text": "short", "job_description": JOB}, headers=H).status_code == 422
        assert client.post("/score", json={"resume_text": RESUME}, headers=H).status_code == 422

    def test_returns_score_evidence_and_template_explanation(self, fake_encoder):
        r = client.post("/score", json={"resume_text": RESUME, "job_description": JOB}, headers=H)
        assert r.status_code == 200
        body = r.json()
        assert 0 <= body["score"] <= 100
        assert {"Python", "SQL"} <= set(body["matched"])
        assert {"Kubernetes", "Terraform"} <= set(body["missing"])
        assert body["explanation_source"] == "template"
        assert "Kubernetes" in body["explanation"]
        assert body["model"] == "fake-bow"

    def test_identical_texts_score_100(self, fake_encoder):
        body = client.post("/score", json={"resume_text": JOB, "job_description": JOB}, headers=H).json()
        assert body["score"] == 100 and body["missing"] == []

    def test_truncation_flag(self, fake_encoder):
        long_text = "python " * 300
        body = client.post("/score", json={"resume_text": long_text, "job_description": JOB}, headers=H).json()
        assert body["truncated_resume"] is True and body["truncated_job"] is False

    def test_model_load_failure_is_503(self, monkeypatch):
        def boom():
            raise OSError("no model")

        monkeypatch.setattr(embeddings, "get_encoder", boom)
        r = client.post("/score", json={"resume_text": RESUME, "job_description": JOB}, headers=H)
        assert r.status_code == 503


class TestExplanation:
    def test_gemini_receives_only_score_and_terms(self, monkeypatch):
        seen = {}

        def fake(prompt, **kw):
            seen["prompt"], seen["kw"] = prompt, kw
            return "Looks decent."

        monkeypatch.setattr(gemini, "generate", fake)
        text, source = explain.explain(72, ["Python"], ["Kubernetes"])
        assert (text, source) == ("Looks decent.", "gemini")
        assert "72/100" in seen["prompt"] and "Python" in seen["prompt"] and "Kubernetes" in seen["prompt"]
        assert seen["kw"]["temperature"] <= 0.2
        assert "probability" in seen["prompt"]  # instructs the model not to call it a probability

    def test_falls_back_when_gemini_fails_or_is_blank(self, monkeypatch):
        def boom(prompt, **kw):
            raise gemini.GeminiError("x")

        monkeypatch.setattr(gemini, "generate", boom)
        assert explain.explain(40, [], ["Go"])[1] == "template"
        monkeypatch.setattr(gemini, "generate", lambda p, **kw: "")
        assert explain.explain(40, [], ["Go"])[1] == "template"

    def test_template_bands_and_terms_only(self):
        assert "strong" in explain.template_explanation(80, ["A"], [])
        assert "moderate" in explain.template_explanation(60, ["A"], ["B"])
        weak = explain.template_explanation(20, [], ["B"])
        assert "weak" in weak and "No job keywords were found" in weak and "B" in weak

    def test_resume_text_never_enters_the_prompt(self):
        p = explain.build_prompt(50, ["Python"], ["Docker"])
        assert "resume" not in p.lower().split("similarity score")[1]


def test_real_model_ranks_related_text_above_unrelated():
    pytest.importorskip("sentence_transformers")
    try:
        enc = embeddings.get_encoder()
    except Exception as exc:  # offline / model unavailable
        pytest.skip(f"embedding model unavailable: {exc}")
    a, b, c = enc.encode(
        ["Python developer building REST APIs", "Backend engineer with Python and API experience", "Pastry chef making croissants"]
    )
    related, unrelated = embeddings.match_score(embeddings.cosine(a, b)), embeddings.match_score(embeddings.cosine(a, c))
    assert related > unrelated + 30
    embeddings.set_encoder(None)
