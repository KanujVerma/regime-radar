# Historical Analog Finder — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the 3 closest historical market setups to today's conditions, using RegimeRadar's own 22-feature signal space. Answers: "have we seen this kind of setup before, and what happened next?"

**Architecture:** New backend module (`src/models/analogs.py`) builds an in-memory analog index at startup. The `/analogs` endpoint queries it using today's live feature vector. New `ClosestHistoricalSetups` section on the Signal Breakdown page renders 3 `AnalogCard` components.

**Tech Stack:** scikit-learn StandardScaler, NumPy L2 distance, FastAPI, React/TypeScript, existing Pydantic schema pattern.

---

## Analog Pool

The pool is the full historical features DataFrame — the same 7,833 rows (`1995-04-07 → 2026-05-22`) produced by `build_features(panel, regime_series=regime).dropna()`. This is already computed in `AppState._do_refresh()` as the `features` variable. No OOF artifact join needed.

**Near-end filter (applied at index-build time):**
Exclude any date `d` where `d + 20 trading days > dataset_end_date`. Approximately the last 20 rows of the pool are removed. This ensures every analog in the pool has a complete 20-day forward history. Because today's queries already exclude the last 126 trading days via the recency filter, this is belt-and-suspenders for the live endpoint — but required for correctness if historical queries are added later.

---

## Feature Set

All 22 model input features. Exactly:

```
ret_1d, ret_5d, ret_20d, momentum_20d, dist_sma50,
rv_10d, rv_20d, rv_20d_pct, vix_level, vix_chg_1d, vix_chg_5d,
vix_zscore_252d, vix_pct_504d, drawdown, drawdown_pct_504d,
trend_code, emv_level, emv_chg_5d, emv_lag_5d, emv_lag_20d,
days_in_regime_lag1, turbulent_count_30d_lag1
```

Do not include regime labels, transition_risk predictions, or any post-hoc derived field — those are leakage in the distance metric.

**Iteration Lever #1 — Feature weights (do not implement in v1):**
`days_in_regime_lag1` and `turbulent_count_30d_lag1` encode regime path (how long conditions have persisted) rather than instantaneous market stress (VIX level, vol, drawdown). If analogs feel path-similar but not stress-similar — e.g., the model keeps surfacing other "long calm streak" dates regardless of VIX or volatility conditions — the first lever is to multiply these two columns by a weight `w ∈ [0, 1]` after standardization, before L2 distance. Default `w = 1.0` (v1, no weighting). Do not implement now; document as the explicit first thing to revisit if analog quality feels wrong after live testing.

---

## Standardization and Distance

**Scaler:** `sklearn.preprocessing.StandardScaler` fit on the filtered analog pool (after near-end exclusion). Store the fitted scaler in the analog index for reuse at query time.

**Distance metric:** Euclidean (L2) distance in standardized feature space. Not cosine — cosine would treat "VIX at 15, rising fast" and "VIX at 45, rising fast" as close because direction matches. Euclidean in standardized space captures both direction and magnitude of stress, which is the right comparison for "have I seen this exact level of pressure before."

**Do not show** the raw distance value to the user. It carries no intuitive meaning and risks false precision.

---

## Exclusion Rules (applied in order)

1. **Recency exclusion:** Set distance to `inf` for any analog date within **126 trading days** of the query date. Rolling features (rv_20d, vix_zscore_252d, emv_lag_20d, etc.) heavily overlap within this window — those dates are not independent setups.

2. **Inter-analog deduplication:** After sorting by distance, select analogs greedily: accept the closest date, then skip any subsequent candidate within **63 trading days** of an already-accepted analog. This prevents all 3 cards from being drawn from the same 3-week crisis window (e.g., March 2020 days 1, 8, and 14).

---

## Outcome Line Computation (precise)

**Window:** 20 trading days — days `d+1` through `d+20` inclusive.

**Source:** Regime labels (`regime_series`, ground truth), not model predictions.

**Definition of escalation:** A transition to a strictly worse regime within the 20-day window:
- From Calm: any day showing Elevated or Turbulent
- From Elevated: any day showing Turbulent
- From Turbulent: escalation is not possible (already worst state)

**Result strings:**
- If any escalation: `"Escalated to {Regime} within {first_day_offset} days"` — where `first_day_offset` is the number of trading days from `d` to the first escalation day (1-indexed).
- If no escalation in window: `"Remained {analog_regime}"` — where `analog_regime` is the regime on date `d`.

**Near-end exclusion** (see Analog Pool section) guarantees the full 20-day window is always available for any surfaced analog. No partial-window or "insufficient history" code path is needed at runtime.

---

## SPY Forward Returns

Computed at index-build time from the `close` column of `data/processed/panel.parquet` (confirmed column name: `close`).

```python
spy_fwd_5d[d]  = close[d+5]  / close[d] - 1
spy_fwd_20d[d] = close[d+20] / close[d] - 1
```

Where `d+N` means N trading days forward (pandas `.iloc[i + N]`, not calendar offset). Forward return computation uses the same near-end filter — dates without a full 20-day forward close window are excluded from the pool.

---

## Backend Architecture

### New module: `src/models/analogs.py`

```python
from dataclasses import dataclass
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

FEAT_COLS = [
    "ret_1d", "ret_5d", "ret_20d", "momentum_20d", "dist_sma50",
    "rv_10d", "rv_20d", "rv_20d_pct", "vix_level", "vix_chg_1d", "vix_chg_5d",
    "vix_zscore_252d", "vix_pct_504d", "drawdown", "drawdown_pct_504d",
    "trend_code", "emv_level", "emv_chg_5d", "emv_lag_5d", "emv_lag_20d",
    "days_in_regime_lag1", "turbulent_count_30d_lag1",
]
RECENCY_DAYS = 126
DEDUP_DAYS = 63
FORWARD_WINDOW = 20

@dataclass
class AnalogIndex:
    dates: pd.DatetimeIndex       # filtered pool dates
    matrix: np.ndarray            # shape (N, 22), standardized
    scaler: StandardScaler
    regimes: pd.Series            # regime label at each pool date
    transition_risks: pd.Series   # model's transition_risk at each pool date (from OOF or daily state)
    spy_fwd_5d: np.ndarray
    spy_fwd_20d: np.ndarray
    regime_outcomes: list[str]    # pre-computed outcome lines, parallel to dates
    feature_set_version: str      # "v1_all22"

def build_analog_index(
    features_df: pd.DataFrame,
    regime_series: pd.Series,
    spy_close: pd.Series,
    transition_risk_series: pd.Series,
) -> AnalogIndex:
    """Build the in-memory analog index. Called once per refresh cycle."""
    ...

def find_analogs(
    query_date: date,
    query_features: pd.Series,
    index: AnalogIndex,
    n: int = 3,
) -> list[dict]:
    """Return top-n analog dicts, applying recency and dedup exclusions."""
    ...
```

**`build_analog_index` steps:**
1. Join `features_df`, `regime_series`, `spy_close`, `transition_risk_series` on DatetimeIndex
2. Apply near-end filter: drop last `FORWARD_WINDOW` rows (dates without full forward close window)
3. Pre-compute `spy_fwd_5d`, `spy_fwd_20d` for each pool date
4. Pre-compute `regime_outcome_20d` string for each pool date (see Outcome Line)
5. Fit `StandardScaler` on the `FEAT_COLS` columns of the filtered pool
6. Store normalized matrix, scaler, metadata in `AnalogIndex`

**`find_analogs` steps:**
1. Normalize `query_features[FEAT_COLS]` using stored scaler
2. Compute `distances = np.linalg.norm(index.matrix - normalized_query, axis=1)`
3. Set `distances[abs(pool_dates - query_date) <= RECENCY_DAYS trading days] = inf`
4. Sort by distance ascending
5. Greedy dedup: walk sorted indices, accept if >63 trading days from all accepted so far
6. Return first `n` accepted as list of dicts

### State integration (`src/api/state.py`)

In `_do_refresh()`:
- After `features = build_features(panel, regime_series=regime).dropna()`, add:
  ```python
  from src.models.analogs import build_analog_index
  from src.models.registry import load_artifact
  oof_df = load_artifact("oof_predictions")
  transition_risk_series = oof_df["transition_risk"]
  self._analog_index = build_analog_index(
      features_df=features,
      regime_series=regime,
      spy_close=panel["close"],
      transition_risk_series=transition_risk_series,
  )
  self._latest_features = features.iloc[-1].copy()
  self._latest_date = features.index[-1].date()
  ```
- Initialize `_analog_index = None`, `_latest_features = None`, `_latest_date = None` in `__init__`.
- `_load_from_snapshots()` calls `_do_refresh()`, so index is always built on both live and demo paths.

### New endpoint: `GET /analogs`

No query parameters for v1. Always queries today's (latest) live features.

**Response if analog index not yet built:** 503 with `"Analog index not available"`.

**Response schema:**

```python
class AnalogEntry(BaseModel):
    display_date: str        # "Apr 2020" — month + year only, no exact day
    full_date: str           # "2020-04-03" — internal, not shown in UI
    regime: str              # "calm" | "elevated" | "turbulent"
    transition_risk: float   # model's reading on that date
    spy_fwd_5d: float        # e.g. -0.042
    spy_fwd_20d: float       # e.g. -0.112
    regime_outcome_20d: str  # "Escalated to Turbulent within 7 days" | "Remained Calm"

class AnalogsResponse(BaseModel):
    query_date: str               # today
    query_regime: str
    query_transition_risk: float
    analogs: list[AnalogEntry]    # always length 3 (or fewer if pool is very small)
    feature_set_version: str      # "v1_all22"
```

---

## Frontend Architecture

### New hook: `src/hooks/useAnalogs.ts`

Fetches `/analogs`. Returns `AnalogsResponse | null`. No parameters.

### New component: `src/components/AnalogCard.tsx`

Props: `AnalogEntry`.

Layout (single card):
- **Date** — `display_date` in large muted text ("Apr 2020")
- **Regime badge** — colored label using existing regime color scheme
- **Transition risk** — e.g., "18% risk"
- **SPY returns** — two cells: `5d: −4.2%` and `20d: −11.1%`. Neutral color (not red/green — these are outcomes, not signals). Show sign explicitly.
- **Outcome line** — plain text, smaller: "Escalated to Turbulent within 7 days" or "Remained Calm"

### New component: `src/components/ClosestHistoricalSetups.tsx`

Props: `AnalogsResponse`.

```
┌─────────────────────────────────────────────────┐
│ Closest Historical Setups                        │
│ Nearest matches in RegimeRadar's 22-feature      │
│ signal space — not price-pattern matching        │
├─────────────────────────────────────────────────┤
│  [AnalogCard]  [AnalogCard]  [AnalogCard]        │
├─────────────────────────────────────────────────┤
│ Outcome variance is the honest answer — these   │
│ are three different histories, not an average.  │
└─────────────────────────────────────────────────┘
```

Cards arranged in a row on desktop, stacked on mobile. Footer note is in small muted text.

Loading state: 3 skeleton cards. Error/unavailable state: silent (don't render the section).

### Page integration: Signal Breakdown (`src/pages/ModelDrivers.tsx`)

Add `ClosestHistoricalSetups` below the push/pull panel and above the reliability/threshold tradeoff table. The existing Signal Breakdown layout already has this vertical stack — this is an insertion, not a restructure.

---

## Tests

### Unit tests: `tests/test_analogs.py`

1. `find_analogs` returns exactly 3 results when pool is large
2. No analog date is within 126 trading days of the query date
3. No two analog dates are within 63 trading days of each other
4. Feature matrix has exactly 22 columns (matches `FEAT_COLS`)
5. Dates with insufficient forward history are excluded from the pool (last 20 rows of features history are never surfaced)
6. Outcome line is `"Escalated to {regime} within N days"` when escalation occurs in window
7. Outcome line is `"Remained {regime}"` when no escalation in 20-day window
8. Query date recency exclusion: a date 125 days before query is excluded; a date 127 days before is eligible

### API smoke test: `tests/test_api_smoke.py`

Add: `GET /analogs` returns 200, response has `analogs` list of length 3, each entry has all required fields.

---

## What This Is Not

- Not price-pattern matching (does not look at SPY chart shape)
- Not a prediction ("this will happen again") — variance across the 3 outcomes is surfaced deliberately
- Not averaged — outcomes are shown individually so the user sees the spread
- `full_date` is available in the API response but should not be shown in the UI card (month/year precision is intentional to avoid false exactness)

---

## Iteration Roadmap (post-v1, not in scope)

1. **Feature weight tuning** — Lever #1 per design. If analogs feel path-similar but not stress-similar, down-weight `days_in_regime_lag1` and `turbulent_count_30d_lag1` (w ∈ [0, 1]).
2. **Historical date query** — `GET /analogs?date=YYYY-MM-DD` to power Event Replay analog context. Requires checking that `date - 126 days` is within the pool.
3. **Regime-conditional return table** — When analog finder is established, add aggregate statistics (median/quartile outcomes by transition-risk band) as a companion view. This is the path to decision-support (Sub-project C).
