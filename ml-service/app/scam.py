"""Hybrid scam detection: data-driven rules + optional classifier, fused into a risk score.

    rho  = (rules fired) / m                      (m = number of rules)
    r    = w_r * rho + w_c * P_clf                (w_r + w_c = 1; then r = max(r, rho) if rule_floor)
    band = safe if r < theta1; caution if theta1 <= r < theta2; else high

With no trained classifier, falls back to rule-only mode (w_r = 1, w_c = 0) and says so in `mode`.
"""
import fnmatch
import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_RULES_PATH = Path(__file__).parent / "data" / "scam_rules.json"
_EMAIL = re.compile(r"[\w.+-]+@([\w-]+(?:\.[\w-]+)+)", re.IGNORECASE)


@dataclass(frozen=True)
class Rule:
    id: str
    name: str
    reason: str
    type: str
    patterns: tuple = ()
    domains: tuple = ()


@dataclass(frozen=True)
class RuleSet:
    rules: tuple
    negation: re.Pattern
    negation_window: int


@dataclass
class Fired:
    id: str
    name: str
    reason: str
    evidence: str


@dataclass
class Screening:
    rho: float
    p_clf: float | None
    risk: float
    band: str
    mode: str  # "hybrid" | "rule-only"
    fired: list[Fired] = field(default_factory=list)
    checked: list[dict] = field(default_factory=list)  # every rule with whether it fired


@dataclass(frozen=True)
class Settings:
    theta1: float = 0.25
    theta2: float = 0.5
    w_r: float = 0.5  # w_c = 1 - w_r
    # Deviation from the plain formula (documented in the README): in hybrid mode the risk is never lower than the
    # rule-only risk, so explicit rule evidence (e.g. "pay a registration fee") cannot be diluted by the classifier.
    rule_floor: bool = True

    @staticmethod
    def from_env() -> "Settings":
        """Defaults < tuned values from models/scam_settings.json (written by the training script) < env vars."""
        base = {"theta1": 0.25, "theta2": 0.5, "w_r": 0.5}
        tuned_path = Path(os.environ.get("SCAM_SETTINGS_PATH") or DEFAULT_SETTINGS_PATH)
        if tuned_path.exists() and get_classifier() is not None:  # tuned values only make sense with their model
            base.update({k: float(v) for k, v in json.loads(tuned_path.read_text()).items() if k in base})
        s = Settings(
            theta1=float(os.environ.get("SCAM_THETA1", base["theta1"])),
            theta2=float(os.environ.get("SCAM_THETA2", base["theta2"])),
            w_r=float(os.environ.get("SCAM_W_R", base["w_r"])),
            rule_floor=os.environ.get("SCAM_RULE_FLOOR", "1") not in ("0", "false", "False"),
        )
        if not (0 <= s.theta1 < s.theta2 <= 1) or not (0 <= s.w_r <= 1):
            raise ValueError("Invalid scam settings: need 0 <= theta1 < theta2 <= 1 and 0 <= SCAM_W_R <= 1")
        return s


def load_rules(path: str | os.PathLike | None = None) -> RuleSet:
    p = Path(path or os.environ.get("SCAM_RULES_PATH") or DEFAULT_RULES_PATH)
    data = json.loads(p.read_text(encoding="utf-8"))
    rules = tuple(
        Rule(
            id=r["id"], name=r["name"], reason=r["reason"], type=r["type"],
            patterns=tuple(r.get("patterns", ())), domains=tuple(r.get("domains", ())),
        )
        for r in data["rules"]
    )
    if not rules:
        raise ValueError("scam rule file contains no rules")
    return RuleSet(rules, re.compile(data["negation_pattern"], re.IGNORECASE), int(data.get("negation_window", 25)))


_rules_cache: RuleSet | None = None


def get_rules() -> RuleSet:
    global _rules_cache
    if _rules_cache is None:
        _rules_cache = load_rules()
    return _rules_cache


def _snippet(text: str, start: int, end: int, pad: int = 25) -> str:
    """Matched text plus ~pad characters of context each side, trimmed to whole words."""
    lo = 0 if start <= pad else text.rfind(" ", 0, start - pad) + 1
    hi = len(text) if end + pad >= len(text) else text.find(" ", end + pad)
    hi = len(text) if hi == -1 else hi
    out = re.sub(r"\s+", " ", text[lo:hi]).strip()
    return ("…" if lo > 0 else "") + out + ("…" if hi < len(text) else "")


def _check_rule(rule: Rule, text: str, rs: RuleSet) -> str | None:
    """Return an evidence snippet if the rule fires, else None."""
    if rule.type == "regex":
        for pat in rule.patterns:
            for m in re.finditer(pat, text, re.IGNORECASE):
                before = text[max(0, m.start() - rs.negation_window): m.start()]
                before = re.split(r"[.;!?\n]", before)[-1]  # negation never reaches across a sentence
                if rs.negation.search(before):
                    continue  # e.g. "no registration fee"
                return _snippet(text, m.start(), m.end())
        return None
    if rule.type == "email_domain":
        for m in _EMAIL.finditer(text):
            domain = m.group(1).lower()
            if any(fnmatch.fnmatch(domain, d) for d in rule.domains):
                return m.group(0)
        return None
    raise ValueError(f"unknown rule type {rule.type!r}")


def rule_score(text: str, rs: RuleSet | None = None) -> tuple[float, list[Fired], list[dict]]:
    rs = rs or get_rules()
    fired: list[Fired] = []
    checked: list[dict] = []
    for rule in rs.rules:
        evidence = _check_rule(rule, text, rs)
        checked.append({"id": rule.id, "name": rule.name, "fired": evidence is not None})
        if evidence is not None:
            fired.append(Fired(rule.id, rule.name, rule.reason, evidence))
    return len(fired) / len(rs.rules), fired, checked


def band_for(risk: float, s: Settings) -> str:
    if risk < s.theta1:
        return "safe"
    if risk < s.theta2:
        return "caution"
    return "high"


def fuse(rho: float, p_clf: float | None, s: Settings) -> tuple[float, str]:
    """Return (risk, mode). Falls back to rule-only when there is no classifier probability."""
    if p_clf is None:
        return rho, "rule-only"
    risk = s.w_r * rho + (1 - s.w_r) * p_clf
    return (max(risk, rho) if s.rule_floor else risk), "hybrid"


def screen(text: str, classifier=None, settings: Settings | None = None, rs: RuleSet | None = None) -> Screening:
    s = settings or Settings.from_env()
    rho, fired, checked = rule_score(text, rs)
    p = classifier.predict_proba(text) if classifier is not None else None
    risk, mode = fuse(rho, p, s)
    risk = round(risk, 4)
    return Screening(rho=round(rho, 4), p_clf=None if p is None else round(p, 4), risk=risk,
                     band=band_for(risk, s), mode=mode, fired=fired, checked=checked)


# ---- optional trained classifier (trained in Phase 5; absent => rule-only) -------------------

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "scam_clf.joblib"
DEFAULT_SETTINGS_PATH = DEFAULT_MODEL_PATH.with_name("scam_settings.json")
_clf_cache: tuple[str, object | None] | None = None


class _SklearnPipeline:
    def __init__(self, pipe):
        self.pipe = pipe

    def predict_proba(self, text: str) -> float:
        return float(self.pipe.predict_proba([text])[0][1])


def get_classifier():
    """Load the trained model if the file exists. The file is a local trusted artifact (joblib/pickle)."""
    global _clf_cache
    path = str(os.environ.get("SCAM_MODEL_PATH") or DEFAULT_MODEL_PATH)
    if _clf_cache is not None and _clf_cache[0] == path:
        return _clf_cache[1]
    clf = None
    if os.path.exists(path):
        import joblib  # only needed once a model exists

        clf = _SklearnPipeline(joblib.load(path))
    _clf_cache = (path, clf)
    return clf


def reset_caches() -> None:
    global _rules_cache, _clf_cache
    _rules_cache = None
    _clf_cache = None
