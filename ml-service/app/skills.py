"""Skill extraction against a curated lexicon (app/data/skills_lexicon.json).

Used for listing `requiredSkills`, market demand and the roadmap. A lexicon (rather than every keyword) keeps
demand counts about skills, not about words like "build" or "engineer". Matching is longest-first over lemmatized
tokens, so "Machine Learning", "machine-learning" and "ML" all count as the same skill.
"""
import json
import os
import re
from pathlib import Path

from . import keywords

LEXICON_PATH = Path(__file__).parent / "data" / "skills_lexicon.json"
_SPECIAL = [("c++", "cplusplus"), ("c#", "csharp"), ("node.js", "nodejs"), ("react.js", "reactjs"), ("vue.js", "vuejs"),
            ("next.js", "nextjs"), ("express.js", "expressjs"), ("asp.net", "dotnet"), (".net", "dotnet"), ("ci/cd", "cicd"),
            ("a/b", "ab"), ("tcp/ip", "tcp ip"), ("scikit-learn", "scikit learn")]
_TOKEN = re.compile(r"[A-Za-z0-9]+")
_SPECIAL_RE = [(re.compile(re.escape(src), re.IGNORECASE), f" {dst} ") for src, dst in _SPECIAL]


def _tokens(text: str) -> list[tuple[str, bool]]:
    """(normalised token, was written capitalised) pairs."""
    for rx, repl in _SPECIAL_RE:
        text = rx.sub(repl, text)
    out = []
    for raw in _TOKEN.findall(text):
        low = raw.lower()
        out.append((low if len(low) <= 3 else keywords.normalize(low), raw[0].isupper()))
    return out


class Lexicon:
    def __init__(self, skills: dict[str, list[str]], case_sensitive: frozenset[str] = frozenset()):
        self.by_first: dict[str, list[tuple[tuple[str, ...], str, bool]]] = {}
        self.canonical = set(skills)
        for name, aliases in skills.items():
            for alias in set(aliases):
                seq = tuple(t for t, _ in _tokens(alias))
                if seq:
                    needs_cap = name in case_sensitive and len(seq) == 1
                    self.by_first.setdefault(seq[0], []).append((seq, name, needs_cap))
        for lst in self.by_first.values():
            lst.sort(key=lambda x: -len(x[0]))  # longest alias first

    def extract(self, text: str) -> set[str]:
        pairs = _tokens(text)
        toks = [t for t, _ in pairs]
        found: set[str] = set()
        i = 0
        while i < len(toks):
            hit = None
            for seq, name, needs_cap in self.by_first.get(toks[i], ()):
                if tuple(toks[i:i + len(seq)]) == seq and (pairs[i][1] or not needs_cap):
                    hit = (len(seq), name)
                    break
            if hit:
                found.add(hit[1])
                i += hit[0]
            else:
                i += 1
        return found


_lexicon: Lexicon | None = None


def get_lexicon() -> Lexicon:
    global _lexicon
    if _lexicon is None:
        path = Path(os.environ.get("SKILLS_LEXICON_PATH") or LEXICON_PATH)
        data = json.loads(path.read_text(encoding="utf-8"))
        _lexicon = Lexicon(data["skills"], frozenset(data.get("case_sensitive", ())))
    return _lexicon


def extract_skills(text: str) -> set[str]:
    return get_lexicon().extract(text)


def reset_cache() -> None:
    global _lexicon
    _lexicon = None
