"""Unit tests for src/models/analogs.py"""
from __future__ import annotations
import numpy as np
import pandas as pd
import pytest
from datetime import date
from sklearn.preprocessing import StandardScaler


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_index(n: int = 400, seed: int = 0):
    """Build a synthetic AnalogIndex directly for testing find_analogs."""
    from src.models.analogs import AnalogIndex, FEAT_COLS, FEATURE_SET_VERSION
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range("2005-01-03", periods=n)
    X = rng.standard_normal((n, len(FEAT_COLS)))
    scaler = StandardScaler()
    matrix = scaler.fit_transform(X)
    return AnalogIndex(
        dates=dates,
        matrix=matrix,
        scaler=scaler,
        regimes=["calm"] * n,
        transition_risks=[0.1] * n,
        spy_fwd_5d=np.zeros(n),
        spy_fwd_20d=np.zeros(n),
        regime_outcomes=["Remained Calm"] * n,
        feature_set_version=FEATURE_SET_VERSION,
    )


def _make_inputs(n_total: int = 500, n_oof: int = 400, seed: int = 0):
    """Build synthetic build_analog_index inputs with n_oof OOF rows (rest NaN)."""
    from src.models.analogs import FEAT_COLS
    rng = np.random.default_rng(seed)
    all_dates = pd.bdate_range("2005-01-03", periods=n_total)
    features_df = pd.DataFrame(
        rng.standard_normal((n_total, len(FEAT_COLS))),
        index=all_dates,
        columns=FEAT_COLS,
    )
    regime_series = pd.Series(
        np.resize(["calm", "elevated", "turbulent"], n_total),
        index=all_dates,
    )
    spy_close = pd.Series(
        np.cumprod(1 + rng.normal(0.0003, 0.01, n_total)) * 100,
        index=all_dates,
    )
    oof_vals = np.full(n_total, np.nan)
    oof_vals[:n_oof] = rng.uniform(0.05, 0.45, n_oof)
    transition_risk_series = pd.Series(oof_vals, index=all_dates)
    return features_df, regime_series, spy_close, transition_risk_series


# ── Test 1: find_analogs returns exactly 3 ────────────────────────────────────

def test_find_analogs_returns_three():
    from src.models.analogs import find_analogs, FEAT_COLS
    index = _make_index(400)
    query_features = pd.Series(np.zeros(len(FEAT_COLS)), index=FEAT_COLS)
    results = find_analogs(date(2030, 1, 1), query_features, index, n=3)
    assert len(results) == 3


# ── Test 2: No analog within RECENCY_ROWS of query (row-position) ─────────────

def test_no_analog_within_recency_rows():
    from src.models.analogs import find_analogs, FEAT_COLS, RECENCY_ROWS
    index = _make_index(400)
    query_features = pd.Series(np.zeros(len(FEAT_COLS)), index=FEAT_COLS)
    results = find_analogs(date(2030, 1, 1), query_features, index, n=3)
    pool_len = len(index.dates)  # query_row_pos = pool_len (past end)
    for r in results:
        pos = index.dates.get_loc(pd.Timestamp(r["full_date"]))
        assert abs(pos - pool_len) > RECENCY_ROWS, (
            f"Analog at row {pos} is within {RECENCY_ROWS} rows of query_row_pos={pool_len}"
        )


# ── Test 3: No two analogs within DEDUP_ROWS of each other ───────────────────

def test_no_two_analogs_within_dedup_rows():
    from src.models.analogs import find_analogs, FEAT_COLS, DEDUP_ROWS
    index = _make_index(400)
    query_features = pd.Series(np.zeros(len(FEAT_COLS)), index=FEAT_COLS)
    results = find_analogs(date(2030, 1, 1), query_features, index, n=3)
    positions = [index.dates.get_loc(pd.Timestamp(r["full_date"])) for r in results]
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            assert abs(positions[i] - positions[j]) > DEDUP_ROWS, (
                f"Analogs at rows {positions[i]} and {positions[j]} are within {DEDUP_ROWS} rows"
            )


# ── Test 4: Feature matrix has exactly 22 columns ────────────────────────────

def test_analog_matrix_has_22_columns():
    from src.models.analogs import build_analog_index, FEAT_COLS
    features_df, regime_series, spy_close, oof = _make_inputs()
    index = build_analog_index(features_df, regime_series, spy_close, oof)
    assert index.matrix.shape[1] == 22
    assert len(FEAT_COLS) == 22


# ── Test 5: Last FORWARD_WINDOW OOF rows excluded from pool ──────────────────

def test_near_end_rows_excluded():
    from src.models.analogs import build_analog_index, FORWARD_WINDOW
    features_df, regime_series, spy_close, oof = _make_inputs(n_total=500, n_oof=400)
    index = build_analog_index(features_df, regime_series, spy_close, oof)
    oof_dates = oof.dropna().index
    excluded = oof_dates[-FORWARD_WINDOW:]
    for d in excluded:
        assert d not in index.dates, (
            f"Date {d.date()} is in the last {FORWARD_WINDOW} OOF rows and must be excluded"
        )


# ── Test 6: Outcome line "Escalated to X within N days" ──────────────────────

def test_outcome_line_escalation():
    from src.models.analogs import build_analog_index, FEAT_COLS
    n = 200
    all_dates = pd.bdate_range("2005-01-03", periods=n)
    rng = np.random.default_rng(1)
    features_df = pd.DataFrame(
        rng.standard_normal((n, len(FEAT_COLS))),
        index=all_dates,
        columns=FEAT_COLS,
    )
    # Regime is calm everywhere. Position 55 = 5 days after position 50 → elevated.
    regimes = ["calm"] * n
    regimes[55] = "elevated"
    regime_series = pd.Series(regimes, index=all_dates)
    spy_close = pd.Series(
        np.cumprod(1 + rng.normal(0.0003, 0.01, n)) * 100, index=all_dates
    )
    # OOF covers positions 0-99; after FORWARD_WINDOW trim, pool is 0-79.
    oof_vals = np.full(n, np.nan)
    oof_vals[:100] = 0.1
    oof = pd.Series(oof_vals, index=all_dates)

    index = build_analog_index(features_df, regime_series, spy_close, oof)

    target = all_dates[50]
    assert target in index.dates, "Position 50 must be in the pool"
    idx = index.dates.get_loc(target)
    assert index.regime_outcomes[idx] == "Escalated to Elevated within 5 days", (
        f"Got: {index.regime_outcomes[idx]!r}"
    )


# ── Test 7: Outcome line "Remained X" when no escalation ─────────────────────

def test_outcome_line_no_escalation():
    from src.models.analogs import build_analog_index, FEAT_COLS
    n = 200
    all_dates = pd.bdate_range("2005-01-03", periods=n)
    rng = np.random.default_rng(2)
    features_df = pd.DataFrame(
        rng.standard_normal((n, len(FEAT_COLS))),
        index=all_dates,
        columns=FEAT_COLS,
    )
    regime_series = pd.Series(["calm"] * n, index=all_dates)
    spy_close = pd.Series(
        np.cumprod(1 + rng.normal(0.0003, 0.01, n)) * 100, index=all_dates
    )
    oof_vals = np.full(n, np.nan)
    oof_vals[:100] = 0.1
    oof = pd.Series(oof_vals, index=all_dates)

    index = build_analog_index(features_df, regime_series, spy_close, oof)
    assert all(o == "Remained Calm" for o in index.regime_outcomes), (
        "All outcomes must be 'Remained Calm' when regime never escalates"
    )


# ── Test 8: Recency boundary (row 125 before query excluded; 127 before eligible)

def test_recency_exclusion_boundary():
    from src.models.analogs import find_analogs, AnalogIndex, FEAT_COLS, FEATURE_SET_VERSION, RECENCY_ROWS
    n = 400
    rng = np.random.default_rng(3)
    dates = pd.bdate_range("2005-01-03", periods=n)
    # query_row_pos = n = 400 (past pool end)
    # row 275: |275 - 400| = 125  → excluded  (≤ RECENCY_ROWS=126)
    # row 273: |273 - 400| = 127  → eligible   (> RECENCY_ROWS=126)
    X = np.ones((n, len(FEAT_COLS))) * 999.0  # all far from query
    X[275] = 0.0   # would be closest but is within recency window
    X[273] = 0.01  # second closest but outside recency window → should be returned
    scaler = StandardScaler()
    matrix = scaler.fit_transform(X)
    index = AnalogIndex(
        dates=dates, matrix=matrix, scaler=scaler,
        regimes=["calm"] * n, transition_risks=[0.1] * n,
        spy_fwd_5d=np.zeros(n), spy_fwd_20d=np.zeros(n),
        regime_outcomes=["Remained Calm"] * n,
        feature_set_version=FEATURE_SET_VERSION,
    )
    query_features = pd.Series(np.zeros(len(FEAT_COLS)), index=FEAT_COLS)
    results = find_analogs(date(2030, 1, 1), query_features, index, n=3)
    result_positions = [dates.get_loc(pd.Timestamp(r["full_date"])) for r in results]
    assert 275 not in result_positions, "Row 275 (distance 125 ≤ 126) must be excluded"
    assert 273 in result_positions, "Row 273 (distance 127 > 126) must be eligible"


# ── Test 9: All parallel AnalogIndex structures have same length ──────────────

def test_analog_index_alignment():
    from src.models.analogs import build_analog_index
    features_df, regime_series, spy_close, oof = _make_inputs()
    index = build_analog_index(features_df, regime_series, spy_close, oof)
    n = len(index.dates)
    assert index.matrix.shape[0] == n
    assert len(index.regimes) == n
    assert len(index.transition_risks) == n
    assert len(index.spy_fwd_5d) == n
    assert len(index.spy_fwd_20d) == n
    assert len(index.regime_outcomes) == n


# ── Test 10: find_analogs returns fewer than n when pool is too small ─────────

def test_find_analogs_returns_fewer_when_pool_is_small():
    """When exclusions leave fewer than n candidates, return what's available cleanly."""
    from src.models.analogs import find_analogs, AnalogIndex, FEAT_COLS, FEATURE_SET_VERSION
    # With n=150 pool rows and query past the end (query_row_pos=150),
    # recency exclusion (RECENCY_ROWS=126) removes rows 24-149.
    # Rows 0-23 are eligible (24 rows). With DEDUP_ROWS=63, only 1 fits.
    n = 150
    rng = np.random.default_rng(5)
    dates = pd.bdate_range("2005-01-03", periods=n)
    X = rng.standard_normal((n, len(FEAT_COLS)))
    scaler = StandardScaler()
    matrix = scaler.fit_transform(X)
    index = AnalogIndex(
        dates=dates, matrix=matrix, scaler=scaler,
        regimes=["calm"] * n, transition_risks=[0.1] * n,
        spy_fwd_5d=np.zeros(n), spy_fwd_20d=np.zeros(n),
        regime_outcomes=["Remained Calm"] * n,
        feature_set_version=FEATURE_SET_VERSION,
    )
    query_features = pd.Series(np.zeros(len(FEAT_COLS)), index=FEAT_COLS)
    results = find_analogs(date(2030, 1, 1), query_features, index, n=3)
    # Must not raise and must return fewer than 3
    assert isinstance(results, list)
    assert len(results) < 3


# ── Test 11: Recency exclusion with query date inside the pool ────────────────

def test_recency_exclusion_query_inside_pool():
    """Query at pool position 200: rows within 126 positions of 200 are excluded."""
    from src.models.analogs import find_analogs, AnalogIndex, FEAT_COLS, FEATURE_SET_VERSION, RECENCY_ROWS
    n = 400
    dates = pd.bdate_range("2005-01-03", periods=n)
    # query at position 200 (inside pool) → query_row_pos = 200
    # Row 75: |75 - 200| = 125 ≤ 126 → excluded
    # Row 73: |73 - 200| = 127 > 126 → eligible
    X = np.ones((n, len(FEAT_COLS))) * 999.0
    X[75] = 0.0    # closest feature-space match but within recency window → excluded
    X[73] = 0.01   # outside recency window → must appear
    scaler = StandardScaler()
    matrix = scaler.fit_transform(X)
    index = AnalogIndex(
        dates=dates, matrix=matrix, scaler=scaler,
        regimes=["calm"] * n, transition_risks=[0.1] * n,
        spy_fwd_5d=np.zeros(n), spy_fwd_20d=np.zeros(n),
        regime_outcomes=["Remained Calm"] * n,
        feature_set_version=FEATURE_SET_VERSION,
    )
    query_features = pd.Series(np.zeros(len(FEAT_COLS)), index=FEAT_COLS)
    query_date = dates[200].date()  # inside the pool
    results = find_analogs(query_date, query_features, index, n=3)
    result_positions = [dates.get_loc(pd.Timestamp(r["full_date"])) for r in results]
    assert 75 not in result_positions, "Row 75 (distance 125 ≤ 126) must be excluded"
    assert 73 in result_positions, "Row 73 (distance 127 > 126) must be eligible"
