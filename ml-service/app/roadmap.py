"""Skill-gap roadmap.

    d(s)   = (listings containing s) / n
    S_role = { s : d(s) >= tau }
    G      = S_role \\ S_user
    roadmap = G sorted by descending d(s)      (ties: alphabetical)
Gemini only receives the role and skill names to write short learning guidance; a template is used if it fails.
"""
import json
import re

from . import gemini
from . import skills as skills_mod

MAX_ITEMS = 15


def build_gap(skill_counts: dict[str, int], n: int, tau: float, user_skills: set[str]) -> tuple[list[dict], list[dict]]:
    """Return (gap items, covered items) as dicts with skill, count and demand."""
    if n <= 0:
        return [], []
    role = [{"skill": s, "count": c, "demand": round(c / n, 4)} for s, c in skill_counts.items() if c / n >= tau]
    role.sort(key=lambda x: (-x["demand"], x["skill"]))
    gap = [x for x in role if x["skill"] not in user_skills]
    covered = [x for x in role if x["skill"] in user_skills]
    return gap, covered


def template_guidance(skill: str, count: int, n: int) -> str:
    return (f"{skill} appears in {count} of {n} sampled listings. Learn the fundamentals, then build one small "
            f"project that uses it and add it to your resume once you can demonstrate it.")


def _parse_json_object(raw: str) -> dict:
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    data = json.loads(m.group(0) if m else raw)
    return {str(k): str(v) for k, v in data.items() if isinstance(v, str) and v.strip()}


def guidance_for(role: str, items: list[dict], n: int) -> list[tuple[str, str]]:
    """Return [(text, source)] aligned with items."""
    names = [i["skill"] for i in items]
    llm: dict[str, str] = {}
    if names:
        prompt = (
            f"A job seeker wants to work as: {role}. For each skill below, write ONE or TWO short sentences of "
            "practical learning guidance (what to learn first and one small project idea). Use only the skill "
            "names given; do not invent facts about the person or the job market. Respond with only a JSON "
            "object mapping each skill name exactly as written to its guidance string.\n\nSkills: " + json.dumps(names)
        )
        try:
            llm = _parse_json_object(gemini.generate(prompt, temperature=0.3, max_tokens=1200))
        except (gemini.GeminiNotConfigured, gemini.GeminiError, ValueError):
            llm = {}
    return [(llm[i["skill"]], "gemini") if i["skill"] in llm else (template_guidance(i["skill"], i["count"], n), "template") for i in items]


def build_roadmap(role: str, user_skills: list[str], user_text: str, skill_counts: dict[str, int], n: int, tau: float) -> dict:
    lex = skills_mod.get_lexicon()
    have = lex.extract(", ".join(user_skills) + "\n" + user_text)
    # a user-typed skill that is not in the lexicon still counts if it equals a canonical name
    have |= {s for s in user_skills if s in lex.canonical}
    gap, covered = build_gap(skill_counts, n, tau, have)
    gap = gap[:MAX_ITEMS]
    guidance = guidance_for(role, gap, n)
    items = [{**g, "guidance": text, "guidance_source": src} for g, (text, src) in zip(gap, guidance, strict=True)]
    return {"n": n, "tau": tau, "role_skill_count": len(gap) + len(covered), "items": items, "covered": covered, "user_skills": sorted(have)}
