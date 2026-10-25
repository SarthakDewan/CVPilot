"""Resume phrasing suggestions (Gemini). Receives one snippet, never a whole resume."""
import re

from . import gemini

PROMPTS = {
    "bullet": (
        "Rewrite the resume bullet below as 3 alternative versions. Start each with a strong action verb, "
        "keep it to one line, and keep every fact as written. Do NOT invent numbers, tools, employers or "
        "results that are not in the original. Output exactly 3 lines, no numbering, no commentary.\n\n"
        "Bullet:\n{text}"
    ),
    "summary": (
        "Rewrite the resume summary below as 2 alternative versions of at most 3 sentences each. Keep every "
        "fact as written and do NOT invent achievements, numbers or skills. Output exactly 2 lines separated "
        "by a newline, no numbering, no commentary.\n\nSummary:\n{text}"
    ),
}


def parse_suggestions(raw: str, limit: int) -> list[str]:
    lines = [re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", ln).strip() for ln in raw.splitlines()]
    return [ln for ln in lines if ln][:limit]


def suggest(kind: str, text: str) -> list[str]:
    raw = gemini.generate(PROMPTS[kind].format(text=text), temperature=0.4)
    return parse_suggestions(raw, 3 if kind == "bullet" else 2)
