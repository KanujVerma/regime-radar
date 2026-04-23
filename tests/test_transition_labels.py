"""Tests for transition label generation."""
import pandas as pd
import pytest
from src.labeling.build_transition_labels import build_transition_labels


def make_regime(labels: list[str]) -> pd.Series:
    dates = pd.bdate_range("2000-01-03", periods=len(labels), freq="B")
    return pd.Series(labels, index=dates, name="regime")


class TestTransitionLabels:
    def test_turbulent_always_zero(self):
        """Turbulent rows never get label=1 (no higher regime)."""
        regimes = make_regime(["turbulent"] * 20)
        labels = build_transition_labels(regimes, config={"horizon_days": 5, "persistence_days": 3})
        assert (labels == 0).all()

    def test_detects_calm_to_elevated(self):
        """Calm followed by 3+ consecutive elevated days within 5 days → label=1."""
        regimes = make_regime(["calm"] * 5 + ["elevated"] * 10)
        labels = build_transition_labels(regimes, config={"horizon_days": 5, "persistence_days": 3})
        assert labels.iloc[0] == 1

    def test_persistence_rule_prevents_false_positives(self):
        """A 2-day elevated spell does not trigger label=1 when persistence=3."""
        regimes = make_regime(["calm"] * 5 + ["elevated"] * 2 + ["calm"] * 10)
        labels = build_transition_labels(regimes, config={"horizon_days": 5, "persistence_days": 3})
        assert labels.iloc[0] == 0

    def test_end_of_series_gets_zero(self):
        """Rows within horizon_days of end get label=0 (unknown future)."""
        regimes = make_regime(["calm"] * 15)
        labels = build_transition_labels(regimes, config={"horizon_days": 5, "persistence_days": 3})
        assert (labels.iloc[-5:] == 0).all()
