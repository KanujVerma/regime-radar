"""Historical analog finder: nearest neighbors in RegimeRadar's 22-feature signal space."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

FEAT_COLS: list[str] = [
    "ret_1d", "ret_5d", "ret_20d", "momentum_20d", "dist_sma50",
    "rv_10d", "rv_20d", "rv_20d_pct", "vix_level", "vix_chg_1d", "vix_chg_5d",
    "vix_zscore_252d", "vix_pct_504d", "drawdown", "drawdown_pct_504d",
    "trend_code", "emv_level", "emv_chg_5d", "emv_lag_5d", "emv_lag_20d",
    "days_in_regime_lag1", "turbulent_count_30d_lag1",
]
RECENCY_ROWS: int = 126
DEDUP_ROWS: int = 63
FORWARD_WINDOW: int = 20
FEATURE_SET_VERSION: str = "v1_all22"

_WORSE: dict[str, set[str]] = {
    "calm": {"elevated", "turbulent"},
    "elevated": {"turbulent"},
    "turbulent": set(),
}


@dataclass
class AnalogIndex:
    dates: pd.DatetimeIndex
    matrix: np.ndarray
    scaler: StandardScaler
    regimes: list[str]
    transition_risks: list[float]
    spy_fwd_5d: np.ndarray
    spy_fwd_20d: np.ndarray
    regime_outcomes: list[str]
    feature_set_version: str


def _regime_outcome(analog_regime: str, forward_regimes: list[str]) -> str:
    worse = _WORSE.get(analog_regime.lower(), set())
    for i, r in enumerate(forward_regimes):
        if r.lower() in worse:
            return f"Escalated to {r.capitalize()} within {i + 1} days"
    return f"Remained {analog_regime.capitalize()}"


def build_analog_index(
    features_df: pd.DataFrame,
    regime_series: pd.Series,
    spy_close: pd.Series,
    transition_risk_series: pd.Series,
) -> AnalogIndex:
    """Build the in-memory analog index. Called once per refresh cycle.

    Pool = inner join of features_df with OOF non-NaN transition_risk.
    Last FORWARD_WINDOW rows are excluded (no complete 20-day forward window).
    All exclusions use row-position distance, not calendar-day arithmetic.
    """
    oof_valid = transition_risk_series.dropna()
    pool_idx = features_df.index.intersection(oof_valid.index)
    pool_features = features_df.loc[pool_idx, FEAT_COLS]
    pool_regimes = regime_series.reindex(pool_idx)
    pool_risks = oof_valid.reindex(pool_idx)

    valid = (
        pool_features.notna().all(axis=1)
        & pool_regimes.notna()
        & pool_risks.notna()
    )
    pool_features = pool_features[valid]
    pool_regimes = pool_regimes[valid]
    pool_risks = pool_risks[valid]

    if len(pool_features) == 0:
        raise ValueError(
            "Analog pool is empty after OOF join. "
            "Ensure oof_predictions artifact has non-NaN transition_risk rows "
            "that overlap with features_df.index."
        )

    if len(pool_features) > FORWARD_WINDOW:
        pool_features = pool_features.iloc[:-FORWARD_WINDOW]
        pool_regimes = pool_regimes.iloc[:-FORWARD_WINDOW]
        pool_risks = pool_risks.iloc[:-FORWARD_WINDOW]

    n = len(pool_features)
    dates = pool_features.index
    regimes = [str(r) for r in pool_regimes.tolist()]
    transition_risks = [float(r) for r in pool_risks.tolist()]

    spy_vals = spy_close.values
    spy_idx = spy_close.index
    spy_fwd_5d = np.zeros(n)
    spy_fwd_20d = np.zeros(n)
    for i, d in enumerate(dates):
        pos = spy_idx.get_loc(d)
        if pos + 5 < len(spy_vals):
            spy_fwd_5d[i] = spy_vals[pos + 5] / spy_vals[pos] - 1
        if pos + 20 < len(spy_vals):
            spy_fwd_20d[i] = spy_vals[pos + 20] / spy_vals[pos] - 1

    reg_vals = regime_series.values
    reg_idx = regime_series.index
    regime_outcomes: list[str] = []
    for i, d in enumerate(dates):
        pos = reg_idx.get_loc(d)
        fwd = [
            str(reg_vals[pos + j])
            for j in range(1, FORWARD_WINDOW + 1)
            if pos + j < len(reg_vals) and not pd.isna(reg_vals[pos + j])
        ]
        regime_outcomes.append(_regime_outcome(regimes[i], fwd))

    X = pool_features.values.astype(float)
    scaler = StandardScaler()
    matrix = scaler.fit_transform(X)

    return AnalogIndex(
        dates=dates,
        matrix=matrix,
        scaler=scaler,
        regimes=regimes,
        transition_risks=transition_risks,
        spy_fwd_5d=spy_fwd_5d,
        spy_fwd_20d=spy_fwd_20d,
        regime_outcomes=regime_outcomes,
        feature_set_version=FEATURE_SET_VERSION,
    )


def find_analogs(
    query_date: date,
    query_features: pd.Series,
    index: AnalogIndex,
    n: int = 3,
) -> list[dict]:
    """Return top-n analog dicts with recency and dedup exclusions applied.

    All exclusions use row-position distance in the pool, not calendar arithmetic.
    """
    q = query_features[FEAT_COLS].values.astype(float).reshape(1, -1)
    q_norm = index.scaler.transform(q)

    distances = np.linalg.norm(index.matrix - q_norm, axis=1).copy()

    pool_len = len(index.dates)
    query_ts = pd.Timestamp(query_date)
    if query_ts > index.dates[-1]:
        query_row_pos = pool_len
    elif query_ts < index.dates[0]:
        query_row_pos = 0
    elif query_ts in index.dates:
        query_row_pos = index.dates.get_loc(query_ts)
    else:
        insert_pos = int(index.dates.searchsorted(query_ts, side="left"))
        query_row_pos = max(0, insert_pos - 1)

    row_positions = np.arange(pool_len)
    distances[np.abs(row_positions - query_row_pos) <= RECENCY_ROWS] = np.inf

    sorted_idx = np.argsort(distances)
    accepted: list[int] = []
    accepted_pos: list[int] = []
    for idx in sorted_idx:
        if distances[idx] == np.inf:
            break
        pos = int(idx)
        if all(abs(pos - ap) > DEDUP_ROWS for ap in accepted_pos):
            accepted.append(idx)
            accepted_pos.append(pos)
            if len(accepted) == n:
                break

    return [
        {
            "display_date": index.dates[idx].strftime("%b %Y"),
            "full_date": str(index.dates[idx].date()),
            "regime": index.regimes[idx],
            "transition_risk": index.transition_risks[idx],
            "spy_fwd_5d": float(index.spy_fwd_5d[idx]),
            "spy_fwd_20d": float(index.spy_fwd_20d[idx]),
            "regime_outcome_20d": index.regime_outcomes[idx],
        }
        for idx in accepted
    ]
