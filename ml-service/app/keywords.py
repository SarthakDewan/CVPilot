"""Keyword extraction for the ATS analyzer.

Pipeline (spec): lowercase -> strip punctuation -> drop stop words and tokens shorter than 3
characters -> lemmatize so inflections match ("API" / "APIs"). Applied identically to resume and job
description, so set operations compare like with like.

Two documented, data-driven deviations from a naive reading of the spec:
* SHORT_TERMS: a few unambiguous technical terms shorter than 3 characters ("c++", "c#", "ai", "ml",
  "ui", "ux", "qa") are kept, otherwise they could never be matched.
* GENERIC_TERMS: job-ad boilerplate ("experience", "team", "ability"...) is dropped from both sets so
  the "missing" list is not dominated by words that say nothing about skills.
Both lists are plain sets below; edit them to taste.
"""
import re
from collections import Counter
from dataclasses import dataclass

import simplemma

STOP_WORDS = frozenset("""
a about above after again against all also am an and any are aren as at be because been before being below
between both but by can cannot could couldn did didn do does doesn doing don down during each few for from
further had hadn has hasn have haven having he her here hers herself him himself his how i if in into is isn
it its itself just let me more most mustn my myself no nor not now of off on once only or other our ours
ourselves out over own same shan she should shouldn so some such than that the their theirs them themselves
then there these they this those through to too under until up very was wasn we were weren what when where
which while who whom why will with won would wouldn you your yours yourself yourselves
""".split())

GENERIC_TERMS = frozenset("""
ability able abilities across additional applicant applicants apply based best candidate candidates
company culture day demonstrated desired detail details duties employer employment environment equal
etc excellent familiarity hiring experience experiences following good great help highly include including includes
join job junior keep lead looking make may need needs new opportunity opportunities part plus position preferred
prior provide required requirement requirements responsibilities responsibility responsible role
roles seeking skill skills solid strong successful senior team teams tool tools understanding use using want well
willing within without work working works write writing year years
""".split())

# Singular nouns that end in "s" and must not be plural-folded.
SINGULAR_S = frozenset("""
analysis basis axis thesis emphasis diagnosis synopsis hypothesis crisis oasis status campus bonus
focus canvas bias lens gas atlas alias kubernetes redis postgres series species css js
""".split())

SHORT_TERMS = frozenset({"c++", "c#", "ai", "ml", "ui", "ux", "qa", "r&d"})

# Protected tokens containing punctuation that a plain word regex would mangle.
_PROTECTED = re.compile(r"(?<![\w+#])(c\+\+|c#|\.net|node\.js|r&d|ci/cd)(?![\w+#])", re.IGNORECASE)
_WORD = re.compile(r"[A-Za-z][A-Za-z0-9]*")


@dataclass(frozen=True)
class Keywords:
    counts: Counter  # lemma -> occurrences
    surface: dict  # lemma -> first surface form seen (what we show the user)

    @property
    def lemmas(self) -> set:
        return set(self.counts)


def normalize(token: str) -> str:
    """Lemmatize, then fold regular plurals that the lemmatizer leaves alone ("apis" -> "api")."""
    if token in SHORT_TERMS:  # the lemmatizer mangles these ("ai" -> "be", "ml" -> "millileter")
        return token
    t = simplemma.lemmatize(token, lang="en").lower()
    if len(t) < 3 <= len(token):  # lemmatizer over-shortened it ("aws" -> "aw"); keep the original word
        t = token
    if len(t) > 3 and t.endswith("ies"):
        return t[:-3] + "y"
    if len(t) > 3 and t.endswith("s") and t not in SINGULAR_S and not t.endswith(("ss", "us")):
        return t[:-1]
    return t


def extract_keywords(text: str) -> Keywords:
    counts: Counter = Counter()
    surface: dict = {}

    def add(raw: str, lemma: str) -> None:
        counts[lemma] += 1
        surface.setdefault(lemma, raw)

    protected_spans = []
    for m in _PROTECTED.finditer(text):
        tok = m.group(1).lower()
        protected_spans.append(m.span())
        if tok == ".net":
            tok = "dotnet"
        if tok == "node.js":
            tok = "nodejs"
        if tok == "ci/cd":
            tok = "cicd"
        add(m.group(1), tok)

    masked = list(text)
    for s, e in protected_spans:
        masked[s:e] = " " * (e - s)
    for m in _WORD.finditer("".join(masked)):
        shown = m.group(0)  # original casing, used for display
        word = shown.lower()
        if word in STOP_WORDS:
            continue
        if len(word) < 3 and word not in SHORT_TERMS:
            continue
        lemma = normalize(word)
        if len(lemma) < 3 and lemma not in SHORT_TERMS:
            continue
        if lemma in STOP_WORDS or lemma in GENERIC_TERMS or word in GENERIC_TERMS:
            continue
        add(shown, lemma)
    return Keywords(counts=counts, surface=surface)


def compare(resume_text: str, job_text: str) -> tuple[list[str], list[str]]:
    """Return (matched, missing) display terms: M = W_R ∩ W_J and Γ = W_J \\ W_R.

    Both are ordered by how often the term appears in the job description (a rough importance
    signal), then alphabetically, so results are deterministic.
    """
    r = extract_keywords(resume_text)
    j = extract_keywords(job_text)
    r_set, j_set = r.lemmas, j.lemmas
    order = lambda lemma: (-j.counts[lemma], lemma)  # noqa: E731
    matched = [j.surface[x] for x in sorted(j_set & r_set, key=order)]
    missing = [j.surface[x] for x in sorted(j_set - r_set, key=order)]
    return matched, missing
