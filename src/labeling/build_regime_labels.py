"""Builds calm/elevated/turbulent regime labels from a market panel."""
from __future__ import annotations
import numpy as np
import pandas as pd
from src.utils.config import get_config


def _rolling_percentile(series: pd.Series, window: int) -> pd.Series:
    """Rolling percentile rank [0,1] using trailing window."""
    return series.rolling(window, min_periods=window).rank(pct=True)


def smooth_offline(raw_labels: pd.Series, n: int) -> pd.Series:
    """Offline smoothing: a label flip is only accepted once it holds for n consecutive days.
    The flip is attributed to the FIRST day of the run.
    Uses forward scan — safe only when the full series is available (training time).
    NaN entries are passed through unchanged and do not participate in smoothing logic.
    """
    labels = raw_labels.tolist()
    smoothed = labels.copy()
    i = 1
    while i < len(labels):
        cur = labels[i]
        prev = smoothed[i - 1]
        # Skip NaN entries
        if cur is None or (isinstance(cur, float) and cur != cur):
            i += 1
            continue
        if prev is None or (isinstance(prev, float) and prev != prev):
            i += 1
            continue
        if cur != prev:
            run_end = min(i + n - 1, len(labels) - 1)
            if all(labels[j] == cur for j in range(i, run_end + 1)):
                pass
            else:
                j = i
                while j < len(labels) and labels[j] != prev:
                    lj = labels[j]
                    if lj is None or (isinstance(lj, float) and lj != lj):
                        break
                    smoothed[j] = prev
                    j += 1
        i += 1
    return pd.Series(smoothed, index=raw_labels.index, name=raw_labels.name)


def smooth_live(raw_labels: pd.Series, n: int) -> pd.Series:
    """Live smoothing: backward-only. A flip is confirmed only when the new label
    has held for n consecutive trailing days. Introduces a known n-day reporting lag.
    Safe for serving (only uses past information).
    """
    labels = raw_labels.tolist()
    smoothed = [labels[0]]
    for i in range(1, len(labels)):
        if labels[i] != smoothed[-1]:
            start = max(0, i - n + 1)
            if all(labels[j] == labels[i] for j in range(start, i + 1)):
                smoothed.append(labels[i])
            else:
                smoothed.append(smoothed[-1])
        else:
            smoothed.append(labels[i])
    return pd.Series(smoothed, index=raw_labels.index, name=raw_labels.name)


def build_regime_labels(
    panel: pd.DataFrame,
    config: dict | None = None,
) -> pd.Series:
    """
    Computes regime label series (calm/elevated/turbulent) from merged panel.

    Steps:
    1. Rolling VIX percentile over trailing_window_days
    2. Rolling realized-vol percentile over trailing_window_days
    3. Rolling drawdown percentile over trailing_window_days
    4. Composite stress = weighted sum
    5. Raw label from thresholds
    6. Smooth with smooth_offline()

    Returns pd.Series of str labels aligned to panel.index.
    """
    if config is None:
        config = get_config("labels")["regime"]

    window = config["trailing_window_days"]
    weights = config["weights"]
    thresholds = config["thresholds"]
    smoothing_n = config["smoothing_days"]

    rv_20d = panel["close"].pct_change().rolling(20, min_periods=20).std() * np.sqrt(252)
    vix_pct = _rolling_percentile(panel["vixcls"], window)
    rv_pct = _rolling_percentile(rv_20d, window)
    drawdown = 1 - panel["close"] / panel["close"].rolling(window, min_periods=1).max()
    dd_pct = _rolling_percentile(drawdown, window)

    stress = (
        weights["vix_percentile"] * vix_pct
        + weights["realized_vol_percentile"] * rv_pct
        + weights["drawdown"] * dd_pct
    )

    raw_labels = stress.apply(
        lambda s: "turbulent" if s >= thresholds["turbulent"]
        else ("elevated" if s >= thresholds["elevated"] else "calm")
        if not np.isnan(s) else np.nan
    )

    smoothed = smooth_offline(raw_labels, smoothing_n)
    smoothed.name = "regime"
    return smoothed
