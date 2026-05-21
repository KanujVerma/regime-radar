"""Unit tests for daily state artifact builder and diff helper."""
import json
from pathlib import Path
from unittest.mock import patch
import pandas as pd
import numpy as np
import pytest


def _make_panel_parquet(directory: Path) -> None:
    dates = pd.date_range("2026-05-19", periods=3, freq="B")
    df = pd.DataFrame({"vixcls": [15.0, 16.0, 18.0], "close": [500.0, 502.0, 498.0]}, index=dates)
    df.to_parquet(directory / "panel.parquet")


@patch("src.models.daily_state.predict_current_state")
@patch("src.models.daily_state.build_features")
@patch("src.models.daily_state.build_trend_labels")
@patch("src.models.daily_state.build_regime_labels")
@patch("src.models.daily_state.artifact_exists", return_value=True)
@patch("src.models.daily_state.load_metadata", return_value={"saved_at": "2026-04-24"})
def test_build_daily_state_shape(mock_meta, mock_exists, mock_regime, mock_trend, mock_feats, mock_predict, tmp_path):
    from src.models.daily_state import build_daily_state

    _make_panel_parquet(tmp_path)
    dates = pd.date_range("2026-05-19", periods=3, freq="B")
    mock_regime.return_value = pd.Series(["calm", "calm", "elevated"], index=dates)
    mock_trend.return_value = pd.Series(["uptrend", "uptrend", "uptrend"], index=dates)
    mock_feats.return_value = pd.DataFrame(np.zeros((3, 2)), index=dates, columns=["f1", "f2"])
    mock_predict.return_value = {
        "regime": "elevated", "transition_risk": 0.20,
        "prob_calm": 0.30, "prob_elevated": 0.65, "prob_turbulent": 0.05,
        "top_drivers": [{"feature": "vix_chg_5d", "importance": 0.03}],
    }

    result = build_daily_state(tmp_path)

    assert result["regime"] == "elevated"
    assert result["transition_risk"] == 0.20
    assert result["as_of_date"] == result["data_through_date"]
    assert result["vix_level"] == 18.0          # last row vixcls
    assert result["trend"] == "uptrend"
    assert len(result["top_drivers"]) == 1
    driver = result["top_drivers"][0]
    assert driver["feature"] == "vix_chg_5d"
    assert "plain_label" in driver              # enriched with human label
    assert "importance" in driver
    assert result["model_version"]["transition_model"] == "xgb_transition"
    assert result["model_version"]["transition_trained_as_of"] == "2026-04-24"
