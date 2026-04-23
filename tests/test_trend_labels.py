"""Tests for trend label generation."""
import numpy as np
import pandas as pd
import pytest
from src.labeling.build_trend_labels import build_trend_labels


def make_panel_from_close(close_arr):
    n = len(close_arr)
    dates = pd.bdate_range("2000-01-03", periods=n, freq="B")
    panel = pd.DataFrame({
        "open": close_arr, "high": close_arr, "low": close_arr,
        "close": close_arr, "volume": 1e8,
        "vixcls": 15.0, "emvoverallemv": 200.0,
    }, index=dates)
    panel.index.name = "date"
    return panel


class TestTrendLabels:
    def test_uptrend_above_sma_positive_return(self):
        """Rising price above SMA50 → uptrend."""
        close = np.linspace(350, 500, 200)
        panel = make_panel_from_close(close)
        trend = build_trend_labels(panel, config={"sma_window": 50, "return_window": 20})
        assert (trend.iloc[-20:] == "uptrend").all()

    def test_downtrend_below_sma_negative_return(self):
        """Falling price below SMA50 → downtrend."""
        close = np.linspace(500, 350, 200)
        panel = make_panel_from_close(close)
        trend = build_trend_labels(panel, config={"sma_window": 50, "return_window": 20})
        assert (trend.iloc[-20:] == "downtrend").all()

    def test_neutral_is_default(self):
        """Flat price → neutral."""
        close = np.ones(200) * 400.0
        panel = make_panel_from_close(close)
        trend = build_trend_labels(panel, config={"sma_window": 50, "return_window": 20})
        valid = trend.dropna()
        assert (valid == "neutral").all()

    def test_output_values_are_valid(self):
        close = np.linspace(300, 500, 300)
        panel = make_panel_from_close(close)
        trend = build_trend_labels(panel, config={"sma_window": 50, "return_window": 20})
        assert set(trend.unique()).issubset({"uptrend", "neutral", "downtrend"})
