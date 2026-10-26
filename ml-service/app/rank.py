"""Job ranking: embed profile + listings (cached), keep the top-K by cosine with a min-heap, screen each."""
import hashlib
import heapq
from collections import OrderedDict
from dataclasses import dataclass

import numpy as np

from . import embeddings, keywords, scam
from . import skills as skills_mod
from .adzuna import Listing

_CACHE_MAX = 2000
_cache: "OrderedDict[str, np.ndarray]" = OrderedDict()


def _key(model: str, text: str) -> str:
    return model + ":" + hashlib.sha1(text.encode("utf-8")).hexdigest()


def embed_cached(enc: embeddings.Encoder, texts: list[str]) -> np.ndarray:
    """Embed texts, re-using cached vectors for listings seen before (keyed by model + text hash)."""
    keys = [_key(enc.name, t) for t in texts]
    missing = [i for i, k in enumerate(keys) if k not in _cache]
    if missing:
        vecs = enc.encode([texts[i] for i in missing])
        for i, v in zip(missing, vecs, strict=True):
            _cache[keys[i]] = v
            if len(_cache) > _CACHE_MAX:
                _cache.popitem(last=False)
    for k in keys:
        _cache.move_to_end(k)
    return np.stack([_cache[k] for k in keys])


def clear_cache() -> None:
    _cache.clear()


def top_k(scored: list[tuple[float, int]], k: int) -> list[tuple[float, int]]:
    """Top-K (score, index) pairs, best first, using a size-K min-heap. Ties keep the earlier index."""
    heap: list[tuple[float, int]] = []
    for score, idx in scored:
        item = (score, -idx)  # negate so that on equal scores the later index is "smaller" and evicted first
        if len(heap) < k:
            heapq.heappush(heap, item)
        elif item > heap[0]:
            heapq.heapreplace(heap, item)
    return [(s, -ni) for s, ni in sorted(heap, reverse=True)]


@dataclass
class Ranked:
    listing: Listing
    score: int
    cosine: float
    matched_terms: list[str]
    keywords: list[str]
    skills: list[str]
    screening: scam.Screening


def rank(profile_text: str, profile_skills: list[str], listings: list[Listing], k: int,
         enc: embeddings.Encoder | None = None, classifier=None, settings: scam.Settings | None = None) -> list[Ranked]:
    if not listings:
        return []
    enc = enc or embeddings.get_encoder()
    vecs = embed_cached(enc, [profile_text] + [job.text for job in listings])
    profile_vec, listing_vecs = vecs[0], vecs[1:]
    sims = [(embeddings.cosine(profile_vec, v), i) for i, v in enumerate(listing_vecs)]
    wanted = keywords.extract_keywords(profile_text + "\n" + " ".join(profile_skills)).lemmas
    out: list[Ranked] = []
    for cos, i in top_k(sims, k):
        job = listings[i]
        kw = keywords.extract_keywords(job.text)
        ordered = sorted(kw.lemmas, key=lambda x: (-kw.counts[x], x))
        out.append(
            Ranked(
                listing=job,
                score=embeddings.match_score(cos),
                cosine=round(cos, 4),
                matched_terms=[kw.surface[x] for x in ordered if x in wanted][:15],
                keywords=[kw.surface[x] for x in ordered][:20],
                skills=sorted(skills_mod.extract_skills(job.text)),
                # every result is screened; high-risk ones are labelled, never dropped
                screening=scam.screen(job.text, classifier=classifier, settings=settings),
            )
        )
    return out
