"""CVPilot ML service.

/health, /suggest, /score, /screen, /rank, /aggregate and /roadmap. Every route except /health requires the
shared-secret header.
"""
import hmac
import os
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import adzuna, gemini, scam
from . import aggregate as aggregate_mod
from . import ats as ats_mod
from . import rank as rank_mod
from . import roadmap as roadmap_mod
from . import suggest as suggest_mod

SECRET_HEADER = "x-ml-secret"

app = FastAPI(title="CVPilot ML Service", version="0.1.0")


def require_secret(x_ml_secret: str | None = Header(default=None)) -> None:
    expected = os.environ.get("ML_SHARED_SECRET", "")
    if not expected or x_ml_secret is None or not hmac.compare_digest(x_ml_secret, expected):
        raise HTTPException(status_code=401, detail="invalid or missing shared secret") from None


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
        raise HTTPException(status_code=503, detail="Phrasing suggestions are unavailable: Gemini is not configured") from None
    except gemini.GeminiError:
        raise HTTPException(status_code=502, detail="Gemini request failed") from None


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


class ScreenRequest(BaseModel):
    text: str = Field(min_length=20, max_length=30000)


def _screening_dict(s: scam.Screening) -> dict:
    return {
        "rho": s.rho, "p_clf": s.p_clf, "risk": s.risk, "band": s.band, "mode": s.mode,
        "fired": [f.__dict__ for f in s.fired], "checked": s.checked,
    }


@app.post("/screen", dependencies=[Depends(require_secret)])
def screen(req: ScreenRequest) -> dict:
    return _screening_dict(scam.screen(req.text, classifier=scam.get_classifier()))


class RankRequest(BaseModel):
    profile_text: str = Field(min_length=10, max_length=30000)
    profile_skills: list[str] = Field(default_factory=list, max_length=200)
    what: str = Field(min_length=2, max_length=120)
    where: str = Field(default="", max_length=120)
    k: int = Field(default=10, ge=1, le=50)
    fetch: int = Field(default=30, ge=5, le=50)


@app.post("/rank", dependencies=[Depends(require_secret)])
def rank_jobs(req: RankRequest) -> dict:
    try:
        listings = adzuna.search(req.what, req.where, limit=req.fetch)
    except adzuna.AdzunaNotConfigured:
        raise HTTPException(status_code=503, detail="Job search is unavailable: Adzuna is not configured") from None
    except adzuna.AdzunaError:
        raise HTTPException(status_code=502, detail="Adzuna request failed") from None
    try:
        ranked = rank_mod.rank(req.profile_text, req.profile_skills, listings, req.k, classifier=scam.get_classifier())
    except (ImportError, OSError) as exc:
        raise HTTPException(status_code=503, detail="Embedding model is unavailable") from exc
    return {
        "fetched": len(listings),
        "mode": ranked[0].screening.mode if ranked else ("hybrid" if scam.get_classifier() else "rule-only"),
        "results": [
            {
                "source_id": r.listing.source_id, "title": r.listing.title, "company": r.listing.company,
                "location": r.listing.location, "description": r.listing.description, "url": r.listing.url,
                "salary_min": r.listing.salary_min, "salary_max": r.listing.salary_max,
                "salary_predicted": r.listing.salary_predicted, "currency": r.listing.currency,
                "score": r.score, "cosine": r.cosine, "matched_terms": r.matched_terms, "keywords": r.keywords, "skills": r.skills,
                "scam": _screening_dict(r.screening),
            }
            for r in ranked
        ],
    }


class AggregateRequest(BaseModel):
    what: str = Field(min_length=2, max_length=120)
    where: str = Field(default="", max_length=120)
    pages: int = Field(default=2, ge=1, le=3)


@app.post("/aggregate", dependencies=[Depends(require_secret)])
def aggregate_market(req: AggregateRequest) -> dict:
    try:
        listings = adzuna.search(req.what, req.where, limit=50, pages=req.pages)
    except adzuna.AdzunaNotConfigured:
        raise HTTPException(status_code=503, detail="Market insights are unavailable: Adzuna is not configured") from None
    except adzuna.AdzunaError:
        raise HTTPException(status_code=502, detail="Adzuna request failed") from None
    agg = aggregate_mod.aggregate(listings)
    return {
        "n": agg["n"], "skill_counts": agg["skill_counts"], "salary": agg["salary"],
        "salary_predicted_share": agg["salary_predicted_share"],
        "listings": [
            {
                "source_id": job.source_id, "title": job.title, "company": job.company, "location": job.location,
                "description": job.description, "url": job.url, "salary_min": job.salary_min, "salary_max": job.salary_max,
                "currency": job.currency, "skills": sk, "scam": _screening_dict(scam.screen(job.text, classifier=scam.get_classifier())),
            }
            for job, sk in zip(listings, agg["listing_skills"], strict=True)
        ],
    }


class RoadmapRequest(BaseModel):
    role: str = Field(min_length=2, max_length=120)
    user_skills: list[str] = Field(default_factory=list, max_length=300)
    user_text: str = Field(default="", max_length=30000)
    skill_counts: dict[str, int] = Field(default_factory=dict)
    n: int = Field(ge=1, le=1000)
    tau: float = Field(default=0.1, ge=0.01, le=1.0)


@app.post("/roadmap", dependencies=[Depends(require_secret)])
def roadmap(req: RoadmapRequest) -> dict:
    return roadmap_mod.build_roadmap(req.role, req.user_skills, req.user_text, req.skill_counts, req.n, req.tau)


@app.get("/internal/status", dependencies=[Depends(require_secret)])
def status() -> dict:
    """Which optional integrations are active. Booleans only; never returns keys."""
    return {
        "classifier": scam.get_classifier() is not None,
        "gemini": bool(os.environ.get("GEMINI_API_KEY")),
        "adzuna": bool(os.environ.get("ADZUNA_APP_ID") and os.environ.get("ADZUNA_APP_KEY")),
        "embedding_model": os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2"),
    }
