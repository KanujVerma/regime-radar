"""Tests for regime label generation."""
import numpy as np
import pandas as pd
import pytest
from src.labeling.build_regime_labels import build_regime_labels, smooth_offline, smooth_live


def make_panel(close, vix):
    """Helper: build minimal merged panel from close and vix arrays."""
    n = len(close)
    dates = pd.bdate_range("2000-01-03", periods=n, freq="B")
    panel = pd.DataFrame({
        "open": close,
        "high": close * 1.01,
        "low": close * 0.99,
        "close": close,
        "volume": 1e8,
        "vixcls": vix,
        "emvoverallemv": 200.0,
    }, index=dates)
    panel.index.name = "date"
    return panel


class TestRegimeLabels:
    def test_calm_series_all_calm(self):
        """VIX dropping to low values after a high-VIX history → calm in final window."""
        n = 600
        close = np.ones(n) * 400.0
        # First 500 days: high VIX establishes range; last 100 days: very low VIX → calm
        vix = np.concatenate([np.ones(500) * 40.0, np.ones(100) * 10.0])
        panel = make_panel(close, vix)
        labels = build_regime_labels(panel)
        valid = labels.dropna()
        # Last 50 valid labels should be calm (low VIX below historical percentile threshold)
        assert (labels.iloc[-50:] == "calm").all(), f"Expected calm in tail, got: {labels.iloc[-50:].value_counts()}"

    def test_turbulent_on_vix_spike(self):
        """A sustained high-VIX + market crash should produce turbulent labels."""
        n = 600
        # First 500 days flat at 400; last 100 days crash to 200 (raises rv + drawdown)
        close = np.ones(n) * 400.0
        close[500:] = np.linspace(400, 200, 100)
        vix = np.concatenate([np.ones(500) * 12.0, np.ones(100) * 80.0])
        panel = make_panel(close, vix)
        labels = build_regime_labels(panel)
        # Last 50 labels should be turbulent (composite stress > 0.70 threshold)
        assert (labels.iloc[-50:] == "turbulent").all()

    def test_smoothing_prevents_single_day_flip(self):
        """A single-day VIX spike should not flip the regime to turbulent."""
        n = 600
        close = np.ones(n) * 400.0
        vix = np.ones(n) * 12.0
        vix[550] = 90.0  # single-day spike to extreme VIX
        panel = make_panel(close, vix)
        labels = build_regime_labels(panel)
        # Day 550: raw label would be turbulent, but smoothing_days=2 rejects single-day flip
        assert labels.iloc[550] != "turbulent"

    def test_output_index_matches_input(self):
        n = 600
        close = np.ones(n) * 400.0
        vix = np.ones(n) * 15.0
        panel = make_panel(close, vix)
        labels = build_regime_labels(panel)
        assert labels.index.equals(panel.index)

    def test_smooth_offline_holds_flip(self):
        """smooth_offline should accept a flip that holds for n days."""
        raw = pd.Series(["calm"] * 5 + ["turbulent"] * 5)
        smoothed = smooth_offline(raw, n=2)
        assert list(smoothed[5:]) == ["turbulent"] * 5

    def test_smooth_offline_rejects_short_flip(self):
        """smooth_offline should reject a flip that lasts only 1 day when n=2."""
        raw = pd.Series(["calm"] * 5 + ["turbulent"] + ["calm"] * 4)
        smoothed = smooth_offline(raw, n=2)
        assert smoothed.iloc[5] == "calm"

    def test_smooth_live_lags_by_n_days(self):
        """smooth_live should only flip after n consecutive days of new label."""
        raw = pd.Series(["calm"] * 5 + ["turbulent"] * 5)
        smoothed = smooth_live(raw, n=2)
        assert smoothed.iloc[5] == "calm"
        assert smoothed.iloc[6] == "turbulent"

    def test_smooth_offline_doesnt_suppress_subsequent_regimes(self):
        """A rejected brief run must not suppress a following valid regime change."""
        # calm * 3, elevated * 1 (fails n=2), turbulent * 5
        raw = pd.Series(["calm"] * 3 + ["elevated"] * 1 + ["turbulent"] * 5)
        smoothed = smooth_offline(raw, n=2)
        # The 5-day turbulent run must survive (elevated blip was rejected, not turbulent)
        assert list(smoothed[-5:]) == ["turbulent"] * 5
