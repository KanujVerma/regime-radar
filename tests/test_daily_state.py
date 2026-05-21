"""Unit tests for daily state artifact builder and diff helper."""
import json
from pathlib import Path
from unittest.mock import patch
import pandas as pd
import numpy as np


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


def test_daily_diff_response_schema_is_valid():
    """Pydantic schema accepts a well-formed diff response."""
    from src.api.schemas import DailyDiffResponse

    payload = {
        "current": {
            "as_of_date": "2026-05-21", "generated_at": "2026-05-21T22:00:00+00:00",
            "data_through_date": "2026-05-21", "regime": "elevated",
            "transition_risk": 0.20, "prob_calm": 0.30, "prob_elevated": 0.65,
            "prob_turbulent": 0.05, "vix_level": 18.0, "trend": "uptrend",
            "top_drivers": [{"feature": "vix_chg_5d", "plain_label": "VIX 5-day change", "importance": 0.03}],
            "model_version": {"transition_model": "xgb_transition", "transition_trained_as_of": "2026-04-24",
                               "regime_model": "xgb_regime", "regime_trained_as_of": "2026-04-24"},
        },
        "previous": {
            "as_of_date": "2026-05-20", "generated_at": "2026-05-20T22:00:00+00:00",
            "data_through_date": "2026-05-20", "regime": "calm",
            "transition_risk": 0.10, "prob_calm": 0.80, "prob_elevated": 0.18,
            "prob_turbulent": 0.02, "vix_level": 15.0, "trend": "uptrend",
            "top_drivers": [{"feature": "vix_pct_504d", "plain_label": "VIX relative to 2-year history", "importance": 0.04}],
            "model_version": {"transition_model": "xgb_transition", "transition_trained_as_of": "2026-04-24",
                               "regime_model": "xgb_regime", "regime_trained_as_of": "2026-04-24"},
        },
        "diff": {
            "regime_changed": True, "prior_regime": "calm",
            "risk_delta": 0.10, "vix_delta": 3.0,
            "trend_changed": False, "prior_trend": None,
            "top_driver_changed": True,
            "prior_top_driver": {"feature": "vix_pct_504d", "plain_label": "VIX relative to 2-year history"},
            "current_top_driver": {"feature": "vix_chg_5d", "plain_label": "VIX 5-day change"},
        },
        "metadata": {"current_date": "2026-05-21", "previous_date": "2026-05-20", "gap_days": 1, "is_stale": False},
    }
    obj = DailyDiffResponse(**payload)
    assert obj.diff.regime_changed is True
    assert obj.metadata.gap_days == 1
    assert obj.diff.prior_top_driver.feature == "vix_pct_504d"
    assert obj.diff.current_top_driver.plain_label == "VIX 5-day change"
