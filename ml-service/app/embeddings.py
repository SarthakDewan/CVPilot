"""Sentence encoder + cosine scorer. MatchScore = round(100 * max(0, cosine(e_R, e_J)))."""
import os
import threading
from typing import Protocol

import numpy as np

DEFAULT_MODEL = "all-MiniLM-L6-v2"


class Encoder(Protocol):
    name: str

    def encode(self, texts: list[str]) -> np.ndarray:
        """L2-normalised embeddings, shape (n, d)."""

    def is_truncated(self, text: str) -> bool:
        """True if the encoder will ignore part of this text (max sequence length)."""


class SentenceTransformerEncoder:
    def __init__(self, name: str):
        from sentence_transformers import SentenceTransformer  # heavy import, keep lazy

        self.name = name
        self._model = SentenceTransformer(name)
        self._lock = threading.Lock()

    def encode(self, texts: list[str]) -> np.ndarray:
        with self._lock:
            return np.asarray(self._model.encode(texts, normalize_embeddings=True, show_progress_bar=False))

    def is_truncated(self, text: str) -> bool:
        tok = self._model.tokenizer
        n = len(tok(text, add_special_tokens=True, truncation=False)["input_ids"])
        return n > int(self._model.max_seq_length)


_encoder: Encoder | None = None
_init_lock = threading.Lock()


def get_encoder() -> Encoder:
    global _encoder
    if _encoder is None:
        with _init_lock:
            if _encoder is None:
                _encoder = SentenceTransformerEncoder(os.environ.get("EMBEDDING_MODEL", DEFAULT_MODEL))
    return _encoder


def set_encoder(enc: Encoder | None) -> None:
    """Swap the encoder (tests, or warming at startup)."""
    global _encoder
    _encoder = enc


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def match_score(cos: float) -> int:
    return round(100 * max(0.0, cos))
