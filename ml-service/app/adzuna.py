"""Adzuna job-search client. This service is the only component that calls Adzuna.

Note: Adzuna's search API returns a truncated description snippet (roughly the first 500 characters),
not the full posting. Embeddings, keywords and scam rules therefore only see that snippet.
"""
import os
from dataclasses import dataclass, field

import httpx

API_ROOT = "https://api.adzuna.com/v1/api/jobs"  # override with ADZUNA_BASE_URL (self-hosted proxy, tests)
CURRENCY = {"in": "INR", "gb": "GBP", "us": "USD", "au": "AUD", "ca": "CAD", "sg": "SGD", "de": "EUR", "fr": "EUR",
            "nl": "EUR", "it": "EUR", "es": "EUR", "at": "EUR", "be": "EUR", "nz": "NZD", "za": "ZAR", "pl": "PLN",
            "br": "BRL", "mx": "MXN", "ch": "CHF"}


class AdzunaNotConfigured(RuntimeError):
    pass


class AdzunaError(RuntimeError):
    pass


@dataclass
class Listing:
    source_id: str
    title: str
    company: str
    location: str
    description: str
    url: str
    salary_min: float | None
    salary_max: float | None
    salary_predicted: bool
    currency: str
    created: str | None = None
    extra: dict = field(default_factory=dict)

    @property
    def text(self) -> str:
        return f"{self.title}. {self.description}"


def _num(v) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def parse_results(payload: dict, country: str) -> list[Listing]:
    out: list[Listing] = []
    for r in payload.get("results", []):
        if not r.get("id") or not r.get("title"):
            continue
        out.append(
            Listing(
                source_id=str(r["id"]),
                title=str(r["title"]),
                company=str((r.get("company") or {}).get("display_name") or ""),
                location=str((r.get("location") or {}).get("display_name") or ""),
                description=str(r.get("description") or ""),
                url=str(r.get("redirect_url") or ""),
                salary_min=_num(r.get("salary_min")),
                salary_max=_num(r.get("salary_max")),
                salary_predicted=str(r.get("salary_is_predicted", "0")) == "1",
                currency=CURRENCY.get(country, ""),
                created=r.get("created"),
            )
        )
    return out


def search(what: str, where: str, *, limit: int = 30, country: str | None = None,
           client: httpx.Client | None = None, pages: int = 1) -> list[Listing]:
    app_id, app_key = os.environ.get("ADZUNA_APP_ID", ""), os.environ.get("ADZUNA_APP_KEY", "")
    if not app_id or not app_key:
        raise AdzunaNotConfigured("ADZUNA_APP_ID / ADZUNA_APP_KEY are not set")
    cc = (country or os.environ.get("ADZUNA_COUNTRY") or "in").lower()
    params = {"app_id": app_id, "app_key": app_key, "results_per_page": min(max(limit, 1), 50),
              "what": what, "content-type": "application/json"}
    if where:
        params["where"] = where
    http = client or httpx.Client(timeout=15.0)
    try:
        root = os.environ.get("ADZUNA_BASE_URL", API_ROOT).rstrip("/")
        out: list[Listing] = []
        seen: set[str] = set()
        for page in range(1, max(1, pages) + 1):
            resp = http.get(f"{root}/{cc}/search/{page}", params=params)
            resp.raise_for_status()
            batch = [job for job in parse_results(resp.json(), cc) if job.source_id not in seen]
            seen.update(job.source_id for job in batch)
            out.extend(batch)
            if len(batch) < params["results_per_page"]:
                break  # last page
        return out
    except (httpx.HTTPError, ValueError) as exc:
        # Deliberately do not chain the original error: its message contains the request URL with the API key.
        raise AdzunaError(f"Adzuna request failed ({type(exc).__name__})") from None
    finally:
        if client is None:
            http.close()
