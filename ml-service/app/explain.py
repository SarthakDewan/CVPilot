"""Plain-language explanation of an ATS result.

Gemini receives ONLY (score, matched terms, missing terms) - never resume or job text. If Gemini is
missing or fails, a deterministic template is returned instead.
"""
from . import gemini

MAX_TERMS = 25


def _band(score: int) -> str:
    if score >= 75:
        return "a strong"
    if score >= 55:
        return "a moderate"
    return "a weak"


def template_explanation(score: int, matched: list[str], missing: list[str]) -> str:
    parts = [f"Your resume has {_band(score)} semantic similarity to this job description ({score}/100)."]
    parts.append(
        ("It already covers: " + ", ".join(matched[:10]) + ".") if matched else "No job keywords were found in your resume."
    )
    if missing:
        parts.append("Consider adding, only where truthful: " + ", ".join(missing[:10]) + ".")
    else:
        parts.append("No keyword gaps were found.")
    return " ".join(parts)


def build_prompt(score: int, matched: list[str], missing: list[str]) -> str:
    return (
        "You are explaining an ATS-style resume check to a job seeker. Write at most 4 short sentences "
        "of plain text. Use ONLY the facts below. Mention only terms from the two lists. Do not invent "
        "skills, numbers, employers or advice about other topics. Do not describe the score as a "
        "probability or a chance of being hired; it is a rescaled similarity between 0 and 100. "
        "Only suggest adding missing terms where the candidate truthfully has the skill.\n\n"
        f"Similarity score: {score}/100\n"
        f"Matched terms: {', '.join(matched[:MAX_TERMS]) or '(none)'}\n"
        f"Missing terms: {', '.join(missing[:MAX_TERMS]) or '(none)'}"
    )


def explain(score: int, matched: list[str], missing: list[str]) -> tuple[str, str]:
    """Return (text, source) where source is 'gemini' or 'template'."""
    try:
        text = gemini.generate(build_prompt(score, matched, missing), temperature=0.1, max_tokens=250)
        if text:
            return text, "gemini"
    except (gemini.GeminiNotConfigured, gemini.GeminiError):
        pass
    return template_explanation(score, matched, missing), "template"
