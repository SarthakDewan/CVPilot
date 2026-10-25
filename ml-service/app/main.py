"""CVPilot ML service.

Phase 1 scaffold: only /health exists. /score, /rank, /screen, /aggregate and
/roadmap are added in later phases. Every route except /health requires the
shared-secret header.
"""
import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException

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
