"""Deterministic and simple ML baselines for honest comparison."""
from __future__ import annotations
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from src.labeling.build_regime_labels import build_regime_labels


def rule_regime_predict(panel: pd.DataFrame, config: dict | None = None) -> pd.Series:
    """Deterministic labeling baseline (label-construction reference).

    Applies the configured regime-label function directly as a predictor.
    Any learned model must outperform this on held-out data to justify its cost.
    Note: because the label IS a function of the input features, this baseline
    has near-perfect in-sample performance but serves as the ceiling for
    reproducibility and the floor for model validation.
    """
    return build_regime_labels(panel, config=config)


def transition_heuristic(vix_pct_series: pd.Series, jump_threshold: float = 15.0) -> pd.Series:
    """Simple VIX-jump heuristic: flag if 5-day VIX percentile delta >= threshold.

    Uses only past information. Returns binary Series (0/1).
    """
    delta = vix_pct_series.diff(5) * 100  # convert [0,1] to percentage points
    return (delta >= jump_threshold).astype(int).rename("transition_heuristic")


class LogisticTransition:
    """Logistic regression transition-risk baseline."""

    def __init__(self, **kwargs):
        self._model = LogisticRegression(max_iter=1000, **kwargs)

    def fit(self, X: pd.DataFrame, y: pd.Series) -> "LogisticTransition":
        self._model.fit(X.fillna(0), y)
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self._model.predict_proba(X.fillna(0))[:, 1]

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self._model.predict(X.fillna(0))


class RandomForestRegime:
    """Random forest regime classifier baseline."""

    def __init__(self, **kwargs):
        self._model = RandomForestClassifier(n_estimators=100, random_state=42, **kwargs)

    def fit(self, X: pd.DataFrame, y: pd.Series) -> "RandomForestRegime":
        self._model.fit(X.fillna(0), y)
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self._model.predict(X.fillna(0))

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self._model.predict_proba(X.fillna(0))
