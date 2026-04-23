"""Historical event replay using out-of-fold walk-forward predictions."""
from __future__ import annotations
import pandas as pd
import numpy as np

EVENT_WINDOWS = {
    "financial_crisis_2008": ("2007-07-01", "2009-06-30"),
    "covid_2020": ("2020-01-15", "2020-05-31"),
    "tightening_2022": ("2022-01-01", "2022-12-31"),
}


def get_event_window(event_name: str) -> tuple[str, str]:
    if event_name not in EVENT_WINDOWS:
        raise ValueError(f"Unknown event: {event_name!r}. Available: {list(EVENT_WINDOWS)}")
    return EVENT_WINDOWS[event_name]


def slice_event(
    oof_predictions: pd.DataFrame,
    event_name: str,
) -> pd.DataFrame:
    """Slice OOF predictions for a named event window.

    Args:
        oof_predictions: DataFrame with DatetimeIndex and columns:
            regime_actual, regime_predicted, transition_risk (OOF scores), transition_actual
        event_name: one of the keys in EVENT_WINDOWS

    Returns:
        Sliced DataFrame for the event window, plus 'warning_lead_days' scalar
        stored as DataFrame attribute oof_slice.attrs["warning_lead_days"].
    """
    start, end = get_event_window(event_name)
    window = oof_predictions.loc[start:end].copy()

    # Compute lead time: days before first turbulent event that risk >= 0.5
    lead_days = _compute_lead_time(window)
    window.attrs["warning_lead_days"] = lead_days
    window.attrs["event_name"] = event_name
    return window


def _compute_lead_time(window: pd.DataFrame, threshold: float = 0.5) -> float:
    """Mean days of early warning across all up-transition events in window."""
    if "transition_actual" not in window.columns or "transition_risk" not in window.columns:
        return float("nan")

    event_dates = window.index[window["transition_actual"] == 1]
    if len(event_dates) == 0:
        return float("nan")

    leads = []
    risk = window["transition_risk"]
    for ed in event_dates:
        lookback = ed - pd.Timedelta(days=30)
        pre_window = risk.loc[lookback:ed]
        crossings = pre_window[pre_window >= threshold]
        if len(crossings) > 0:
            leads.append((ed - crossings.index[0]).days)

    return float(np.mean(leads)) if leads else float("nan")


def build_oof_dataframe(
    all_dates: pd.DatetimeIndex,
    regime_actual: pd.Series,
    regime_predicted: pd.Series,
    transition_actual: pd.Series,
    transition_risk: pd.Series,
) -> pd.DataFrame:
    """Assemble the OOF prediction DataFrame used by slice_event."""
    return pd.DataFrame({
        "regime_actual": regime_actual,
        "regime_predicted": regime_predicted,
        "transition_actual": transition_actual,
        "transition_risk": transition_risk,
    }, index=all_dates)
