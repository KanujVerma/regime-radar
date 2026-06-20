# Freshness-Aware Incremental Fetch + Retrain Staleness Guard

**Date:** 2026-06-20
**Status:** Approved for implementation

---

## Problem

`scripts/retrain.py` is meant to "retrain on current data," but its fetch step is a no-op on stale data. All three fetchers (`fetch_spy_history`, `fetch_vix_history`, `fetch_fred_series`/`fetch_emv`) are **cache-first with no freshness check**:

```python
if cache_path is not None and Path(cache_path).exists():
    return pd.read_parquet(cache_path)   # returns stale cache, never refetches
```

A retrain run on 2026-06-20 re-read caches ending 2026-05-22 (SPY), 2026-05-21 (VIX), 2026-03-01 (EMV), retrained on essentially the 2026-05-23 data, and produced a near-identical model (AUC 0.6631→0.6537 noise) with `max_evaluated_p` unchanged at 0.3 — while exiting 0 and writing a success snapshot. The failure was **silent**: nothing flagged that the data wasn't current.

The known OOF embargo (walk-forward window ends ~20 trading rows before panel end) is **by design** and out of scope; this spec addresses the data-staleness root cause and the silent-success failure mode.

## Goals

1. Fetchers can refresh stale caches incrementally, without re-downloading full history and without losing a good cache on a failed fetch.
2. `retrain.py` always attempts a refresh and **aborts loudly** if the data it would train on is not current. A silent stale retrain becomes structurally impossible.

## Non-goals

- Changing the app/API startup fetch policy — it stays cache-first (fast cold start on Render free tier).
- Scheduled automatic retraining / drift detection (Tier 1b, separate work).
- Altering the OOF walk-forward embargo (by design).

---

## Architecture

### New module: `src/data/freshness.py` (pure functions, no I/O)

- `last_expected_trading_day(asof: date) -> date`
  Most recent XNYS session close on or before `asof`, using `pandas-market-calendars` (holiday/weekend correct). NOTE: `src/utils/calendar.py` is intentionally approximate (`days * 5/7`, no holidays) and must NOT be used for this.

- `is_stale(cache_last: pd.Timestamp, asof: date, cadence: Literal["daily", "monthly"]) -> bool`
  - `daily`: `cache_last.date() < last_expected_trading_day(asof)`
  - `monthly`: `cache_last` older than 35 days vs `asof` (tolerates EMV publication lag)

- `merge_incremental(old: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame`
  Concatenate, drop duplicate index entries keeping `new`, sort by index ascending.

### Fetcher changes

Each fetcher (`fetch_spy_history`, `fetch_vix_history`, `fetch_fred_series`; `fetch_emv` inherits via `fetch_fred_series`) gains `refresh: bool = False` and a cadence (`daily` for SPY/VIX/VIXCLS, `monthly` for EMV).

Behavior matrix:

| cache exists | refresh | stale | action |
|---|---|---|---|
| no | – | – | full download, save (unchanged) |
| yes | False | – | return cache (fast path) |
| yes | True | no | return cache (already current) |
| yes | True | yes | fetch `[cache_last + 1 day → asof]`, `merge_incremental(old, new)`, save; **on fetch exception → log WARNING and return existing cache** |

The keep-cache-on-failure rule honors this codebase's documented outage history (FRED HTTP 500s; VIX has a 3-tier fallback). VIX/EMV existing fallback chains are preserved — refresh wraps the primary fetch only.

### Pipeline + retrain

- `bootstrap_data.run_pipeline(refresh: bool = False)` threads `refresh` into all three fetcher calls.
- `scripts/retrain.py` calls `run_pipeline(refresh=True)`.
- **Retrain freshness guard:** after the panel is built, compute `panel.index.max()` and compare to `last_expected_trading_day(asof)`. If the panel end is more than a small tolerance (default: 3 trading days) behind → log a loud WARNING and `sys.exit(1)`. A `--allow-stale` flag is the only override (used for offline/dev runs). `--dry-run` is unaffected (it exits before fetch).

---

## Data flow

```
retrain.py
  → run_pipeline(refresh=True)
      → fetch_spy_history(refresh=True)   # incremental or cache-on-failure
      → fetch_vix_history(refresh=True)
      → fetch_emv(refresh=True)
      → build panel
  → FRESHNESS GUARD: panel.index.max() vs last_expected_trading_day(today)
        stale & not --allow-stale → WARN + exit(1)
  → train → OOF → reliability rebuild → eval_history write
```

A failed live fetch keeps the last-good cache, so the panel still builds — but the guard then catches the staleness and aborts. A failed refresh degrades to a **loud abort**, never a silent stale retrain.

## Error handling

- Fetch exception during refresh: caught per-source, WARNING logged, existing cache returned. Never overwrite a good cache with empty/partial data.
- EMV monthly cadence + 35-day tolerance prevents false-flagging normal publication lag.
- Guard tolerance (3 trading days) absorbs provider end-of-day lag without masking real staleness.

## Testing (TDD; `respx` for HTTP providers, monkeypatch for yfinance)

`tests/test_freshness.py`:
- `last_expected_trading_day` across a weekend and a known US market holiday.
- `is_stale` daily (current vs behind) and monthly (within vs beyond 35 days).
- `merge_incremental` dedupes overlapping index and sorts.

Fetcher refresh tests (extend existing):
- Cache present + provider returns later rows → cache extended, no duplicate index, sorted.
- Cache present + provider raises → original cache returned unchanged, warning logged.
- Cache present + not stale → no provider call.

Retrain guard (extend `test_retrain_smoke.py`):
- Stale panel + no `--allow-stale` → exit code 1, warning emitted, no artifacts written.
- Current panel → proceeds normally.
- `--allow-stale` on stale panel → proceeds with warning.

---

## Files

**Create:** `src/data/freshness.py`, `tests/test_freshness.py`
**Modify:** `src/data/fetch_yfinance.py`, `src/data/fetch_fred.py`, `src/data/fetch_vix.py`, `scripts/bootstrap_data.py`, `scripts/retrain.py`
**Extend tests:** existing fetcher tests, `tests/test_retrain_smoke.py`

## Environment caveat

This dev machine's source caches end 2026-05-22 while `asof` is 2026-06-20 — either restricted network or a provider horizon at 2026-05-22 in this sandbox. The incremental logic is therefore verified via **mocked providers** (respx/monkeypatch); a live end-to-end refresh to today may not be demonstrable here, but the design and tests are independent of that.

## Interpreter note

The deps (joblib, xgboost, etc.) live under `python3.13` (the interpreter `pytest` uses). Bare `python3` on this machine resolves to a different interpreter without them. Run scripts/tests with `python3.13`. (Minor follow-up: pin/README-document the interpreter.)
