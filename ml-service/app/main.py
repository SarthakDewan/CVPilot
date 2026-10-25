"""CVPilot ML service.

Phase 3: /health, /suggest and /score. /score, /rank, /screen, /aggregate and
/roadmap are added in later phases. Every route except /health requires the
shared-secret header.
"""
import hmac
import os

from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import ats as ats_mod, gemini, suggest as suggest_mod

SECRET_HEADER = "x-ml-secret"

app = FastAPI(title="CVPilot ML Service", version="0.1.0")


def require_secret(x_ml_secret: str | None = Header(default=None)) -> None:
    expected = os.environ.get("ML_SHARED_SECRET", "")
    if not expected or x_ml_secret is None or not hmac.compare_digest(x_ml_secret, expected):
        raise HTTPException(status_code=401, detail="invalid or missing shared secret")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ml-service"}


@app.get("/internal/ping", dependencies=[Depends(require_secret)])
def ping() -> dict[str, str]:
    """Lets the gateway verify the shared secret is configured correctly."""
    return {"status": "ok"}


class SuggestRequest(BaseModel):
    kind: Literal["bullet", "summary"]
    text: str = Field(min_length=10, max_length=1200)


@app.post("/suggest", dependencies=[Depends(require_secret)])
def suggest(req: SuggestRequest) -> dict[str, list[str]]:
    try:
        return {"suggestions": suggest_mod.suggest(req.kind, req.text)}
    except gemini.GeminiNotConfigured:
        raise HTTPException(status_code=503, detail="Phrasing suggestions are unavailable: Gemini is not configured")
    except gemini.GeminiError:
        raise HTTPException(status_code=502, detail="Gemini request failed")


class ScoreRequest(BaseModel):
    resume_text: str = Field(min_length=20, max_length=30000)
    job_description: str = Field(min_length=20, max_length=30000)


class ScoreResponse(BaseModel):
    score: int
    cosine: float
    matched: list[str]
    missing: list[str]
    explanation: str
    explanation_source: Literal["gemini", "template"]
    model: str
    truncated_resume: bool
    truncated_job: bool


@app.post("/score", response_model=ScoreResponse, dependencies=[Depends(require_secret)])
def score(req: ScoreRequest) -> ScoreResponse:
    try:
        result = ats_mod.analyze(req.resume_text, req.job_description)
    except (ImportError, OSError) as exc:  # model could not be loaded/downloaded
        raise HTTPException(status_code=503, detail="Embedding model is unavailable") from exc
    return ScoreResponse(**result.__dict__)
