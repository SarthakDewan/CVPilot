"""Minimal Gemini client. This service is the only place Gemini is called."""
import os

import httpx

API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiNotConfigured(RuntimeError):
    pass


class GeminiError(RuntimeError):
    pass


def generate(prompt: str, *, temperature: float = 0.3, max_tokens: int = 400) -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise GeminiNotConfigured("GEMINI_API_KEY is not set")
    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    try:
        resp = httpx.post(
            f"{API_ROOT}/{model}:generateContent",
            headers={"x-goog-api-key": key},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
            },
            timeout=20.0,
        )
        resp.raise_for_status()
        parts = resp.json()["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts).strip()
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        raise GeminiError("Gemini request failed") from exc
