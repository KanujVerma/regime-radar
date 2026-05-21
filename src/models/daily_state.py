"""Shared utilities for building the committed daily state artifact."""
from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from src.features.build_market_features import build_features
from src.labeling.build_regime_labels import build_regime_labels
from src.labeling.build_trend_labels import build_trend_labels
from src.models.predict_live import predict_current_state
from src.models.registry import artifact_exists, load_metadata

# Human-readable labels for feature keys (risk-raising SHAP contributors only).
# Semantics: top_drivers in the artifact are positive-SHAP contributors — this
# is documented here, not repeated as a runtime field in every artifact JSON.
FEATURE_PLAIN_LABELS: dict[str, str] = {
    "vix_pct_504d":             "VIX relative to 2-year history",
    "vix_level":                "Current VIX level",
    "vix_zscore_252d":          "VIX z-score (1-year)",
    "vix_chg_5d":               "VIX 5-day change",
    "vix_chg_1d":               "VIX 1-day change",
    "vix_30d_chg":              "VIX 30-day change",
    "rv_20d_pct":               "Realized volatility percentile",
    "drawdown_pct_504d":        "Drawdown relative to 2-year history",
    "ret_20d":                  "20-day SPY return",
    "momentum_20d":             "20-day momentum",
    "dist_sma50":               "Distance from 50-day moving average",
    "emv_level":                "Equity market volatility index",
    "emv_3m_chg":               "EMV 3-month change",
    "days_in_regime_lag1":      "Days in current regime (lagged)",
    "turbulent_count_30d_lag1": "Turbulent days in past 30 days (lagged)",
    "trend_code":               "Trend direction",
}


def build_daily_state(snapshots_dir: Path) -> dict:
    """Run inference on panel.parquet from snapshots_dir and return the daily state dict.

    The artifact date is always derived from the panel's last row — never from a
    caller argument. This prevents synthetic relabeling.
    """
    panel = pd.read_parquet(snapshots_dir / "panel.parquet")
    regime = build_regime_labels(panel)
    trend = build_trend_labels(panel)
    features = build_features(panel, regime_series=regime).dropna()
    if features.empty:
        raise ValueError("Panel too short — no non-NaN feature rows after dropna")

    result = predict_current_state(features)

    latest_row = panel.iloc[-1]
    as_of_date = str(panel.index[-1].date())
    trend_latest = str(trend.iloc[-1]) if len(trend) > 0 else "neutral"

    enriched_drivers = [
        {
            "feature": d["feature"],
            "plain_label": FEATURE_PLAIN_LABELS.get(d["feature"], d["feature"]),
            "importance": d["importance"],
        }
        for d in result.get("top_drivers", [])
    ]

    try:
        t_meta = load_metadata("xgb_transition") if artifact_exists("xgb_transition") else {}
    except Exception:
        t_meta = {}
    try:
        r_meta = load_metadata("xgb_regime") if artifact_exists("xgb_regime") else {}
    except Exception:
        r_meta = {}

    return {
        "as_of_date": as_of_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_through_date": as_of_date,
        "regime": result["regime"],
        "transition_risk": result["transition_risk"],
        "prob_calm": result.get("prob_calm"),
        "prob_elevated": result.get("prob_elevated"),
        "prob_turbulent": result.get("prob_turbulent"),
        "vix_level": float(latest_row["vixcls"]) if "vixcls" in latest_row.index else None,
        "trend": trend_latest,
        "top_drivers": enriched_drivers,
        "model_version": {
            "transition_model": "xgb_transition",
            "transition_trained_as_of": str(t_meta.get("saved_at", "unknown")),
            "regime_model": "xgb_regime",
            "regime_trained_as_of": str(r_meta.get("saved_at", "unknown")),
        },
    }
