"""Builds the V1 market feature panel from a merged OHLCV+VIX+EMV DataFrame."""
from __future__ import annotations
import numpy as np
import pandas as pd


def build_features(panel: pd.DataFrame, regime_series: pd.Series | None = None) -> pd.DataFrame:
    """
    Args:
        panel: merged DataFrame with columns open, high, low, close, volume, vixcls, emvoverallemv
               DatetimeIndex named 'date'
        regime_series: optional, pre-computed regime labels (str: calm/elevated/turbulent)
                       aligned to panel.index. Used only with .shift(1) — no leakage.

    Returns:
        DataFrame with all features below, same index as panel (rows with insufficient
        history will have NaN — callers must dropna before training).
    """
    close = panel["close"]
    vix = panel["vixcls"]
    emv = panel["emvoverallemv"]
    daily_ret = close.pct_change()

    feat: dict[str, pd.Series] = {}

    # Returns / momentum
    feat["ret_1d"] = daily_ret
    feat["ret_5d"] = close.pct_change(5)
    feat["ret_20d"] = close.pct_change(20)
    feat["momentum_20d"] = close.pct_change(20)

    sma50 = close.rolling(50, min_periods=50).mean()
    feat["dist_sma50"] = (close - sma50) / sma50

    # Volatility
    feat["rv_10d"] = daily_ret.rolling(10, min_periods=10).std() * np.sqrt(252)
    rv_20d = daily_ret.rolling(20, min_periods=20).std() * np.sqrt(252)
    feat["rv_20d"] = rv_20d
    feat["rv_20d_pct"] = rv_20d.rolling(504, min_periods=504).rank(pct=True)

    # VIX
    feat["vix_level"] = vix
    feat["vix_chg_1d"] = vix.diff(1)
    feat["vix_chg_5d"] = vix.diff(5)
    feat["vix_zscore_252d"] = (vix - vix.rolling(252, min_periods=252).mean()) / vix.rolling(252, min_periods=252).std()
    feat["vix_pct_504d"] = vix.rolling(504, min_periods=504).rank(pct=True)

    # Drawdown
    rolling_max = close.rolling(504, min_periods=1).max()
    drawdown = 1 - close / rolling_max
    feat["drawdown"] = drawdown
    feat["drawdown_pct_504d"] = drawdown.rolling(504, min_periods=504).rank(pct=True)

    # Trend code
    ret_20d = feat["ret_20d"]
    trend_code = pd.Series(0, index=close.index, dtype=int)
    trend_code = trend_code.where(~((close > sma50) & (ret_20d > 0)), other=1)
    trend_code = trend_code.where(~((close < sma50) & (ret_20d < 0)), other=-1)
    feat["trend_code"] = trend_code

    # Macro
    feat["emv_level"] = emv
    feat["emv_chg_5d"] = emv.diff(5)
    feat["emv_lag_5d"] = emv.shift(5)
    feat["emv_lag_20d"] = emv.shift(20)

    # Regime-lag features (leakage-safe)
    if regime_series is not None:
        shifted = regime_series.shift(1)

        # days_in_regime_lag1: consecutive days in current regime as of yesterday
        days_in_regime: list[int] = []
        shifted_list = shifted.tolist()
        for i in range(len(shifted_list)):
            if shifted_list[i] is None or (isinstance(shifted_list[i], float) and np.isnan(shifted_list[i])):
                days_in_regime.append(np.nan)
                continue
            count = 1
            j = i - 1
            while j >= 0 and shifted_list[j] == shifted_list[i]:
                count += 1
                j -= 1
            days_in_regime.append(count)
        feat["days_in_regime_lag1"] = pd.Series(days_in_regime, index=panel.index, dtype=float)

        # turbulent_count_30d_lag1: turbulent days in prior 30 days from shifted series
        regime_code = shifted.map({"calm": 0, "elevated": 1, "turbulent": 2})
        turbulent_code = 2
        feat["turbulent_count_30d_lag1"] = regime_code.rolling(30, min_periods=30).apply(
            lambda x: (x == turbulent_code).sum(), raw=True
        )

    return pd.DataFrame(feat, index=panel.index)
