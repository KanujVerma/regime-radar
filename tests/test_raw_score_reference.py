# tests/test_raw_score_reference.py
import json
import numpy as np
import pandas as pd
from scripts.build_raw_score_reference import build_reference


class _StubModel:
    """predict_proba returns a deterministic monotone function of column 0."""
    def predict_proba(self, X):
        x = np.asarray(X)[:, 0].astype(float)
        p = 1 / (1 + np.exp(-x))
        return np.column_stack([1 - p, p])


def test_build_reference_sorted_and_stamped():
    feats = pd.DataFrame({"a": np.linspace(-3, 3, 200), "b": np.zeros(200)})
    ref = build_reference(model=_StubModel(), features=feats[["a", "b"]],
                          feature_names=["a", "b"], model_version="2026-06-21T00:00:00")
    assert ref["model_version"] == "2026-06-21T00:00:00"
    scores = ref["raw_scores_sorted"]
    assert len(scores) == 200
    assert scores == sorted(scores)               # ascending
    assert 0.0 <= scores[0] <= scores[-1] <= 1.0
    assert ref["n"] == 200


def test_build_reference_is_json_serializable():
    feats = pd.DataFrame({"a": np.linspace(-1, 1, 50), "b": np.zeros(50)})
    ref = build_reference(model=_StubModel(), features=feats[["a", "b"]],
                          feature_names=["a", "b"], model_version="v1")
    json.dumps(ref)  # must not raise
