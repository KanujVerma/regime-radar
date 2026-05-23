# Historical Analog Finder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the 3 closest historical market setups to today's conditions, using RegimeRadar's own 22-feature signal space, with SPY forward returns and regime outcomes on each card.

**Architecture:** New `src/models/analogs.py` builds an `AnalogIndex` at startup (inner-joined to OOF non-NaN rows, scaler fitted in-place). `AppState._do_refresh()` stores the index plus today's feature vector. `GET /analogs` queries it. A new `ClosestHistoricalSetups` section on Signal Breakdown renders 3 `AnalogCard` components; the section is silently absent when the endpoint returns 503.

**Tech Stack:** scikit-learn StandardScaler, NumPy L2 distance, FastAPI, Pydantic, React/TypeScript (existing patterns throughout).

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/models/analogs.py` | `AnalogIndex` dataclass, `build_analog_index()`, `find_analogs()` |
| Create | `tests/test_analogs.py` | 11 unit tests for analogs module |
| Modify | `src/api/state.py` | Build index in `_do_refresh()`, store `_analog_index`, `_latest_features`, `_latest_date` |
| Modify | `src/api/schemas.py` | Add `AnalogEntry`, `AnalogsResponse` Pydantic models |
| Modify | `src/api/routes.py` | Add `GET /analogs` endpoint + schema imports |
| Modify | `tests/test_api_smoke.py` | Add `TestAnalogsEndpoint` class (503 + 200 paths) |
| Modify | `frontend/src/types/api.ts` | Add `AnalogEntry`, `AnalogsResponse` TypeScript interfaces |
| Modify | `frontend/src/api/client.ts` | Add `analogs()` method |
| Create | `frontend/src/hooks/useAnalogs.ts` | Data-fetching hook |
| Create | `frontend/src/components/AnalogCard.tsx` | Single analog card |
| Create | `frontend/src/components/ClosestHistoricalSetups.tsx` | Section wrapper with 3 cards |
| Modify | `frontend/src/pages/ModelDrivers.tsx` | Insert `ClosestHistoricalSetups` before reliability accordion |

---

## Task 1: Core analog module + unit tests

**Files:**
- Create: `src/models/analogs.py`
- Create: `tests/test_analogs.py`

- [ ] **Step 1: Write all 11 unit tests (they will all fail with ImportError)**

Create `tests/test_analogs.py`:

```python
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
```

- [ ] **Step 2: Run tests to confirm all 11 fail with ImportError**

```bash
python3 -m pytest tests/test_analogs.py -v 2>&1 | tail -15
```

Expected: 11 errors, all `ModuleNotFoundError` or `ImportError`.

- [ ] **Step 3: Create `src/models/analogs.py`**

```python
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

# Regimes strictly worse than each starting regime
_WORSE: dict[str, set[str]] = {
    "calm": {"elevated", "turbulent"},
    "elevated": {"turbulent"},
    "turbulent": set(),
}


@dataclass
class AnalogIndex:
    dates: pd.DatetimeIndex
    matrix: np.ndarray          # shape (N, 22), standardized
    scaler: StandardScaler
    regimes: list[str]          # regime label at each pool date
    transition_risks: list[float]
    spy_fwd_5d: np.ndarray      # SPY return d+1 through d+5
    spy_fwd_20d: np.ndarray     # SPY return d+1 through d+20
    regime_outcomes: list[str]  # pre-computed, parallel to dates
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
    # Step 1: Pool = features ∩ OOF non-NaN rows
    oof_valid = transition_risk_series.dropna()
    pool_idx = features_df.index.intersection(oof_valid.index)
    pool_features = features_df.loc[pool_idx, FEAT_COLS]
    pool_regimes = regime_series.reindex(pool_idx)
    pool_risks = oof_valid.reindex(pool_idx)

    # Drop any residual NaN
    valid = (
        pool_features.notna().all(axis=1)
        & pool_regimes.notna()
        & pool_risks.notna()
    )
    pool_features = pool_features[valid]
    pool_regimes = pool_regimes[valid]
    pool_risks = pool_risks[valid]

    # OOF-alignment contract: pool must be non-empty after join
    if len(pool_features) == 0:
        raise ValueError(
            "Analog pool is empty after OOF join. "
            "Ensure oof_predictions artifact has non-NaN transition_risk rows "
            "that overlap with features_df.index."
        )

    # Step 2: Near-end filter — drop last FORWARD_WINDOW rows
    if len(pool_features) > FORWARD_WINDOW:
        pool_features = pool_features.iloc[:-FORWARD_WINDOW]
        pool_regimes = pool_regimes.iloc[:-FORWARD_WINDOW]
        pool_risks = pool_risks.iloc[:-FORWARD_WINDOW]

    n = len(pool_features)
    dates = pool_features.index
    regimes = [str(r) for r in pool_regimes.tolist()]
    transition_risks = [float(r) for r in pool_risks.tolist()]

    # Step 3: Forward SPY returns (row-position based on full spy_close series)
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

    # Step 4: Regime outcomes (row-position based on full regime_series)
    reg_vals = regime_series.values
    reg_idx = regime_series.index
    regime_outcomes: list[str] = []
    for i, d in enumerate(dates):
        pos = reg_idx.get_loc(d)
        fwd = [
            str(reg_vals[pos + j])
            for j in range(1, FORWARD_WINDOW + 1)
            if pos + j < len(reg_vals)
        ]
        regime_outcomes.append(_regime_outcome(regimes[i], fwd))

    # Step 5: Fit StandardScaler on pool, produce normalized matrix
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

    # Recency exclusion: row-position distance from query
    pool_len = len(index.dates)
    query_ts = pd.Timestamp(query_date)
    if query_ts > index.dates[-1]:
        query_row_pos = pool_len
    elif query_ts < index.dates[0]:
        query_row_pos = 0
    elif query_ts in index.dates:
        query_row_pos = index.dates.get_loc(query_ts)
    else:
        query_row_pos = int(index.dates.searchsorted(query_ts))

    row_positions = np.arange(pool_len)
    distances[np.abs(row_positions - query_row_pos) <= RECENCY_ROWS] = np.inf

    # Greedy dedup: accept closest, skip any within DEDUP_ROWS of accepted
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
```

- [ ] **Step 4: Run all 11 tests to confirm they pass**

```bash
python3 -m pytest tests/test_analogs.py -v 2>&1 | tail -15
```

Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add src/models/analogs.py tests/test_analogs.py
git commit -m "feat: add AnalogIndex module with build_analog_index and find_analogs"
```

---

## Task 2: State integration

**Files:**
- Modify: `src/api/state.py`

**Context:** `AppState.__init__` is at line 26. `_do_refresh()` starts at line 155. `features` and `latest_features` are already computed inside `_do_refresh()` — lines 193 (`features = build_features(...).dropna()`) and 198 (`latest_features = features.iloc[-1]`). Read the full `_do_refresh()` method before editing.

- [ ] **Step 1: Add 3 new attributes to `AppState.__init__`**

In `src/api/state.py`, locate the `__init__` method body. After the line `self._scheduler: BackgroundScheduler | None = None`, add:

```python
        self._analog_index: object | None = None   # AnalogIndex, typed as object to avoid circular import
        self._latest_features: "pd.Series | None" = None
        self._latest_date: "date | None" = None
```

- [ ] **Step 2: Add analog index build block inside `_do_refresh()`**

Read `src/api/state.py` lines 190–200 to confirm exact variable names, then add immediately after the `latest_features = features.iloc[-1]` line:

```python
        # Build analog index (wrapped — failure must not block state refresh)
        try:
            from src.models.analogs import build_analog_index
            from src.models.registry import load_artifact
            oof_df = load_artifact("oof_predictions")
            self._analog_index = build_analog_index(
                features_df=features,
                regime_series=regime,
                spy_close=panel["close"],
                transition_risk_series=oof_df["transition_risk"],
            )
            self._latest_features = features.iloc[-1].copy()
            self._latest_date = features.index[-1].date()
        except Exception as e:
            _logger.warning("Analog index build failed: %s", e)
            self._analog_index = None
            self._latest_features = None
            self._latest_date = None
```

- [ ] **Step 3: Verify existing smoke tests still pass**

```bash
python3 -m pytest tests/test_api_smoke.py -v 2>&1 | tail -10
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/api/state.py
git commit -m "feat: build AnalogIndex in AppState._do_refresh(), store latest features"
```

---

## Task 3: API schemas, endpoint, and smoke test

**Files:**
- Modify: `src/api/schemas.py`
- Modify: `src/api/routes.py`
- Modify: `tests/test_api_smoke.py`

- [ ] **Step 1: Write the two failing smoke tests first**

Open `tests/test_api_smoke.py`. After the last test class, append:

```python
class TestAnalogsEndpoint:
    def test_analogs_503_without_index(self, app_with_state):
        """Returns 503 when analog index has not been built."""
        app, state = app_with_state
        assert state._analog_index is None
        client = TestClient(app)
        resp = client.get("/analogs")
        assert resp.status_code == 503

    def test_analogs_200_with_index(self, app_with_state):
        """Returns 200 with 3 analogs and all required fields when index is present."""
        import numpy as np
        import pandas as pd
        from datetime import date
        from sklearn.preprocessing import StandardScaler
        from src.models.analogs import AnalogIndex, FEAT_COLS, FEATURE_SET_VERSION

        app, state = app_with_state
        state.write_state({
            "as_of_ts": "2024-01-01T00:00:00+00:00",
            "regime": "calm",
            "transition_risk": 0.12,
            "trend": "uptrend",
            "vix_level": 15.0,
            "vix_chg_1d": -0.5,
            "top_drivers": [],
            "mode": "demo",
            "price_card_price": None,
            "prob_calm": 0.7,
            "prob_elevated": 0.2,
            "prob_turbulent": 0.1,
        })
        rng = np.random.default_rng(0)
        n = 400
        dates = pd.bdate_range("2000-01-03", periods=n)
        X = rng.standard_normal((n, len(FEAT_COLS)))
        scaler = StandardScaler()
        matrix = scaler.fit_transform(X)
        state._analog_index = AnalogIndex(
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
        state._latest_date = date(2024, 1, 1)
        state._latest_features = pd.Series(
            rng.standard_normal(len(FEAT_COLS)), index=FEAT_COLS
        )

        client = TestClient(app)
        resp = client.get("/analogs")
        assert resp.status_code == 200
        data = resp.json()
        assert "analogs" in data
        assert len(data["analogs"]) == 3
        required = ("display_date", "full_date", "regime", "transition_risk",
                    "spy_fwd_5d", "spy_fwd_20d", "regime_outcome_20d")
        for entry in data["analogs"]:
            for field in required:
                assert field in entry, f"Missing field: {field}"
```

- [ ] **Step 2: Run to confirm both tests fail**

```bash
python3 -m pytest tests/test_api_smoke.py::TestAnalogsEndpoint -v 2>&1 | tail -10
```

Expected: 2 failures (404 or attribute error — endpoint doesn't exist yet).

- [ ] **Step 3: Add Pydantic schemas to `src/api/schemas.py`**

At the end of `src/api/schemas.py`, append:

```python
class AnalogEntry(BaseModel):
    display_date: str
    full_date: str
    regime: str
    transition_risk: float
    spy_fwd_5d: float
    spy_fwd_20d: float
    regime_outcome_20d: str


class AnalogsResponse(BaseModel):
    query_date: str
    query_regime: str
    query_transition_risk: float
    analogs: list[AnalogEntry]
    feature_set_version: str
```

- [ ] **Step 4: Add `AnalogEntry, AnalogsResponse` to routes.py import**

In `src/api/routes.py`, find the existing `from src.api.schemas import (` block and add `AnalogEntry, AnalogsResponse,` to it. The full import should become:

```python
from src.api.schemas import (
    HealthResponse, CurrentStateResponse, HistoricalStateResponse,
    EventReplayResponse, ModelDriversResponse, DriverItem,
    HistoricalPoint, EventReplayPoint, TransitionRiskResponse, TransitionRiskPoint,
    StateDelta, ScenarioRequest, ScenarioResponse, DriverDelta,
    ReliabilityResponse, DailyDiffResponse, ChangelogResponse,
    AnalogEntry, AnalogsResponse,
)
```

- [ ] **Step 5: Add the `/analogs` route to `src/api/routes.py`**

Append after the last `@router` decorator block in `src/api/routes.py`:

```python
@router.get("/analogs", response_model=AnalogsResponse)
async def get_analogs(request: Request):
    app_state = _get_state(request)
    if (
        app_state._analog_index is None
        or app_state._latest_features is None
        or app_state._latest_date is None
    ):
        raise HTTPException(status_code=503, detail="Analog index not available")
    latest = app_state.read_latest_state()
    if latest is None:
        raise HTTPException(status_code=503, detail="No state available")
    from src.models.analogs import find_analogs
    results = find_analogs(
        query_date=app_state._latest_date,
        query_features=app_state._latest_features,
        index=app_state._analog_index,
    )
    return AnalogsResponse(
        query_date=str(app_state._latest_date),
        query_regime=latest["regime"],
        query_transition_risk=float(latest["transition_risk"]),
        analogs=[AnalogEntry(**r) for r in results],
        feature_set_version=app_state._analog_index.feature_set_version,
    )
```

- [ ] **Step 6: Run all smoke tests**

```bash
python3 -m pytest tests/test_api_smoke.py -v 2>&1 | tail -15
```

Expected: all tests pass including both `TestAnalogsEndpoint` tests.

- [ ] **Step 7: Commit**

```bash
git add src/api/schemas.py src/api/routes.py tests/test_api_smoke.py
git commit -m "feat: add /analogs endpoint with AnalogEntry and AnalogsResponse schemas"
```

---

## Task 4: Frontend types, API client, hook

**Files:**
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/hooks/useAnalogs.ts`

- [ ] **Step 1: Add TypeScript interfaces to `frontend/src/types/api.ts`**

At the end of `frontend/src/types/api.ts`, append:

```typescript
export interface AnalogEntry {
  display_date: string
  full_date: string
  regime: string
  transition_risk: number
  spy_fwd_5d: number
  spy_fwd_20d: number
  regime_outcome_20d: string
}

export interface AnalogsResponse {
  query_date: string
  query_regime: string
  query_transition_risk: number
  analogs: AnalogEntry[]
  feature_set_version: string
}
```

- [ ] **Step 2: Add `AnalogsResponse` import and `analogs()` method to `frontend/src/api/client.ts`**

Add `AnalogsResponse,` to the existing import block at the top of `client.ts`. It should look like:

```typescript
import type {
  CurrentStateResponse,
  HealthResponse,
  HistoricalStateResponse,
  EventReplayResponse,
  ModelDriversResponse,
  ReliabilityResponse,
  ScenarioRequest,
  ScenarioResponse,
  DailyDiffResponse,
  ChangelogResponse,
  AnalogsResponse,
} from '../types/api'
```

Then add `analogs` to the exported `api` object (after the `changelog` method):

```typescript
  analogs: () => get<AnalogsResponse>('/analogs'),
```

- [ ] **Step 3: Create `frontend/src/hooks/useAnalogs.ts`**

```typescript
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AnalogsResponse } from '../types/api'

export function useAnalogs() {
  const [data, setData] = useState<AnalogsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.analogs()
      .then(result => setData(result))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])
  return { data, loading }
}
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/api/client.ts frontend/src/hooks/useAnalogs.ts
git commit -m "feat: add AnalogsResponse types, analogs() API method, useAnalogs hook"
```

---

## Task 5: AnalogCard component

**Files:**
- Create: `frontend/src/components/AnalogCard.tsx`

**Context:** `regimeColor` in `frontend/src/lib/tokens.ts` is typed as `Record<string, string>` — direct lookup is safe. The card uses the same dark-panel aesthetic as the rest of the app: `#0c1520` background, `#1e3a5f` border, muted text.

- [ ] **Step 1: Create `frontend/src/components/AnalogCard.tsx`**

```tsx
import type { AnalogEntry } from '../types/api'
import { regimeColor } from '../lib/tokens'

function fmtReturn(v: number): string {
  const pct = (v * 100).toFixed(1)
  return v >= 0 ? `+${pct}%` : `${pct}%`
}

export default function AnalogCard({ analog }: { analog: AnalogEntry }) {
  const rColor = regimeColor[analog.regime.toLowerCase()] ?? '#64748b'
  return (
    <div style={{
      background: '#0c1520',
      border: '1px solid #1e3a5f',
      borderRadius: 6,
      padding: '12px 14px',
      flex: 1,
      minWidth: 140,
    }}>
      <div style={{ color: '#94a3b8', fontSize: 18, fontWeight: 700, marginBottom: 6, lineHeight: 1 }}>
        {analog.display_date}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <span style={{
          background: rColor + '22',
          color: rColor,
          border: `1px solid ${rColor}44`,
          borderRadius: 4,
          fontSize: 9,
          fontWeight: 700,
          padding: '2px 6px',
          textTransform: 'uppercase' as const,
          letterSpacing: '.08em',
        }}>
          {analog.regime}
        </span>
        <span style={{ color: '#64748b', fontSize: 9 }}>
          {Math.round(analog.transition_risk * 100)}% risk
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ color: '#475569', fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 2 }}>5d SPY</div>
          <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>{fmtReturn(analog.spy_fwd_5d)}</div>
        </div>
        <div>
          <div style={{ color: '#475569', fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 2 }}>20d SPY</div>
          <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>{fmtReturn(analog.spy_fwd_20d)}</div>
        </div>
      </div>
      <div style={{ color: '#64748b', fontSize: 9, lineHeight: 1.4, borderTop: '1px solid #1a2540', paddingTop: 6 }}>
        {analog.regime_outcome_20d}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AnalogCard.tsx
git commit -m "feat: add AnalogCard component"
```

---

## Task 6: ClosestHistoricalSetups section + page integration

**Files:**
- Create: `frontend/src/components/ClosestHistoricalSetups.tsx`
- Modify: `frontend/src/pages/ModelDrivers.tsx`

**Context:** Insertion point in `ModelDrivers.tsx` is between line 218 (`</div>` closing the forward-bullets block) and line 220 (`{/* ── Reliability accordion ── */}`). The section renders silently absent when `analogData` is null.

- [ ] **Step 1: Create `frontend/src/components/ClosestHistoricalSetups.tsx`**

```tsx
import type { AnalogsResponse } from '../types/api'
import AnalogCard from './AnalogCard'

export default function ClosestHistoricalSetups({ data }: { data: AnalogsResponse }) {
  return (
    <div style={{ background: '#080b12', border: '1px solid #1a2540', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: '#cbd5e1', fontSize: 11, fontWeight: 700, marginBottom: 3 }}>
          Closest Historical Setups
        </div>
        <div style={{ color: '#475569', fontSize: 9, lineHeight: 1.4 }}>
          Nearest matches in RegimeRadar's 22-feature signal space — not price-pattern matching
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
        {data.analogs.map(a => (
          <AnalogCard key={a.full_date} analog={a} />
        ))}
      </div>
      <div style={{ color: '#374151', fontSize: 8, marginTop: 10, lineHeight: 1.4 }}>
        Outcome variance is the honest answer — these are three different histories, not an average.
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add imports and hook call to `frontend/src/pages/ModelDrivers.tsx`**

Add two imports at the top of `ModelDrivers.tsx` (after existing imports):

```tsx
import { useAnalogs } from '../hooks/useAnalogs'
import ClosestHistoricalSetups from '../components/ClosestHistoricalSetups'
```

Inside the `ModelDrivers` function body, after the existing hook calls (after line 61 `const { data: stateData, ... } = useCurrentState()`), add:

```tsx
  const { data: analogData } = useAnalogs()
```

- [ ] **Step 3: Insert `ClosestHistoricalSetups` in the JSX**

In the JSX return, find the block that ends with `</div>` on line 218 (closing the forward-bullets `<div>`) and the comment `{/* ── Reliability accordion ── */}` on line 220. Insert between them:

```tsx
        {/* ── Closest Historical Setups ── */}
        {analogData && <ClosestHistoricalSetups data={analogData} />}
```

The surrounding context should look like:

```tsx
          ))}
        </div>

        {/* ── Closest Historical Setups ── */}
        {analogData && <ClosestHistoricalSetups data={analogData} />}

        {/* ── Reliability accordion ── */}
        {data.threshold_sweep.length > 0 && (
```

- [ ] **Step 4: Run the full build to verify no TypeScript errors**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 5: Run the full Python test suite**

```bash
python3 -m pytest tests/ -v 2>&1 | tail -15
```

Expected: all tests pass (105+ tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ClosestHistoricalSetups.tsx frontend/src/pages/ModelDrivers.tsx
git commit -m "feat: add ClosestHistoricalSetups section to Signal Breakdown page"
```

---

## Iteration Lever (post-v1, do not implement now)

If analogs feel path-similar but not stress-similar, the first adjustment is to down-weight `days_in_regime_lag1` and `turbulent_count_30d_lag1` after standardization before computing L2 distance:

```python
# In find_analogs(), after q_norm = index.scaler.transform(q):
PATH_COLS = ["days_in_regime_lag1", "turbulent_count_30d_lag1"]
PATH_COL_IDX = [FEAT_COLS.index(c) for c in PATH_COLS]
WEIGHT = 0.3  # reduce from 1.0 to 0.3
q_norm[:, PATH_COL_IDX] *= WEIGHT
matrix_weighted = index.matrix.copy()
matrix_weighted[:, PATH_COL_IDX] *= WEIGHT
distances = np.linalg.norm(matrix_weighted - q_norm, axis=1).copy()
```

Default is `w = 1.0` (v1). Only adjust if post-live review confirms the problem.
