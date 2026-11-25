from dataclasses import dataclass

from . import embeddings, explain, keywords


@dataclass
class AtsResult:
    score: int
    cosine: float
    matched: list[str]
    missing: list[str]
    explanation: str
    explanation_source: str
    model: str
    truncated_resume: bool
    truncated_job: bool


def analyze(resume_text: str, job_text: str, encoder: embeddings.Encoder | None = None) -> AtsResult:
    enc = encoder or embeddings.get_encoder()
    e_r, e_j = enc.encode([resume_text, job_text])
    cos = embeddings.cosine(e_r, e_j)
    score = embeddings.match_score(cos)
    matched, missing = keywords.compare(resume_text, job_text)
    text, source = explain.explain(score, matched, missing)
    return AtsResult(
        score=score,
        cosine=round(cos, 4),
        matched=matched,
        missing=missing,
        explanation=text,
        explanation_source=source,
        model=enc.name,
        truncated_resume=enc.is_truncated(resume_text),
        truncated_job=enc.is_truncated(job_text),
    )
