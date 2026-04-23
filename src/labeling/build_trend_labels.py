"""Builds uptrend/neutral/downtrend labels from price series."""
from __future__ import annotations
import numpy as np
import pandas as pd
from src.utils.config import get_config


def build_trend_labels(
    panel: pd.DataFrame,
    config: dict | None = None,
) -> pd.Series:
    """
    Returns pd.Series of str: 'uptrend', 'neutral', or 'downtrend'.

    Rules:
    - uptrend: close > SMA_50 AND 20d return > 0
    - downtrend: close < SMA_50 AND 20d return < 0
    - neutral: otherwise
    """
    if config is None:
        cfg = get_config("labels")["trend"]
    else:
        cfg = config

    sma_w = cfg["sma_window"]
    ret_w = cfg["return_window"]

    close = panel["close"]
    sma = close.rolling(sma_w, min_periods=sma_w).mean()
    ret = close.pct_change(ret_w)

    conditions = [
        (close > sma) & (ret > 0),
        (close < sma) & (ret < 0),
    ]
    choices = ["uptrend", "downtrend"]
    trend = pd.Series(
        np.select(conditions, choices, default="neutral"),
        index=close.index,
        name="trend",
    )
    return trend
