import hashlib

import numpy as np
import pytest
from app import embeddings


class FakeEncoder:
    """Deterministic hashed bag-of-words encoder: fast, no model download."""

    name = "fake-bow"
    dim = 256

    def encode(self, texts):
        out = np.zeros((len(texts), self.dim))
        for i, t in enumerate(texts):
            for w in t.lower().split():
                out[i, int(hashlib.md5(w.encode()).hexdigest(), 16) % self.dim] += 1
        norms = np.linalg.norm(out, axis=1, keepdims=True)
        return out / np.where(norms == 0, 1, norms)

    def is_truncated(self, text):
        return len(text.split()) > 200


@pytest.fixture
def fake_encoder():
    enc = FakeEncoder()
    embeddings.set_encoder(enc)
    yield enc
    embeddings.set_encoder(None)
