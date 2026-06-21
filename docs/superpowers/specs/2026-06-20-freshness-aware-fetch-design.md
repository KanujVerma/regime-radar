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
2. `retrain.py` always attempts a refresh and **aborts loudly** if the data it would train on is not current — evaluated **per source against each source's cadence**, not just on the merged panel end. A silent stale retrain (including a single stale source hidden behind a fresh-looking panel) becomes structurally impossible.

## Non-goals

- Changing the app/API startup fetch policy — it stays cache-first (fast cold start on Render free tier).
- Scheduled automatic retraining / drift detection (Tier 1b, separate work).
- Altering the OOF walk-forward embargo (by design).

---

## Architecture

### New module: `src/data/freshness.py` (pure functions, no I/O)

- `last_confirmed_trading_day(asof: date) -> date`
  Most recent XNYS session **strictly before** `asof` (the last session whose close is confirmed available — today's close does not exist until after today's close, so this avoids intraday false-staleness). Uses `pandas-market-calendars` (holiday/weekend correct). NOTE: `src/utils/calendar.py` is intentionally approximate (`days * 5/7`, no holidays) and must NOT be used for this.

- `is_stale(cache_last: pd.Timestamp, asof: date, cadence: Literal["daily", "monthly"]) -> bool`
  - `daily`: `cache_last.date() < last_confirmed_trading_day(asof)`
  - `monthly`: `(asof - cache_last.date()).days > EMV_STALENESS_TOLERANCE_DAYS`

- `merge_incremental(old: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame`
  Concatenate `old` then `new`, then drop duplicate index entries **keeping the `new` row in full** (`~index.duplicated(keep="last")` after `pd.concat([old, new])`), sort by index ascending. **No column-level combine/fill** — a revised row from the provider replaces the cached row wholesale. Rationale: providers revise (yfinance adjusted-close shifts on dividends/splits; FRED restates), so a partial `combine_first`/`fillna` would weld stale columns onto a revised row.

### Named constants (`freshness.py`)

- `EMV_STALENESS_TOLERANCE_DAYS = 45` — monthly-cadence tolerance. EMV publishes ~monthly with lag; 45 days gives headroom so a retrain fired just before a publication does not false-abort. `--allow-stale` covers the "FRED genuinely late this month" case.
- `RETRAIN_STALENESS_TOLERANCE_DAYS = 3` — guard tolerance for the daily panel-end defense-in-depth check (absorbs provider end-of-day lag).

### Source registry (`SOURCE_SPECS`)

Single definition of the data sources and their freshness cadence. The **retrain guard** (`find_stale_sources`) iterates it, so source identity + cadence live in exactly one place and adding a source is a one-line change. `run_pipeline` threads `refresh=` to each fetcher; it keeps its three explicit fetch calls because `merge_market_panel(spy, vix, emv)` needs the frames as named, ordered arguments (forcing that through registry iteration would reduce readability, not improve it).

```
SOURCE_SPECS = [
    SourceSpec(name="spy", cache_filename="spy.parquet", cadence="daily"),
    SourceSpec(name="vix", cache_filename="vix.parquet", cadence="daily"),
    SourceSpec(name="emv", cache_filename="emv.parquet", cadence="monthly"),
]
```

### Fetcher changes

Each fetcher (`fetch_spy_history`, `fetch_vix_history`, `fetch_fred_series`; `fetch_emv` inherits via `fetch_fred_series`) gains `refresh: bool = False` and a cadence (`daily` for SPY/VIX/VIXCLS, `monthly` for EMV).

Behavior matrix:

| cache exists | refresh | stale | action |
|---|---|---|---|
| no | – | – | full download, save (unchanged) |
| yes | False | – | return cache (fast path) |
| yes | True | no | return cache (already current) |
| yes | True | yes | fetch `[cache_last + 1 day → asof]`, `merge_incremental(old, new)`, save; **on fetch exception → log WARNING and return existing cache** |

The keep-cache-on-failure rule honors this codebase's documented outage history (FRED HTTP 500s; VIX has a 3-tier fallback).

**VIX fallback chain is preserved.** `fetch_vix_history` keeps its full FRED VIXCLS → yfinance ^VIX → CSV chain. Refresh only **narrows the requested date range** to `[cache_last + 1 day → asof]` and runs that delta through the *same* chain, then `merge_incremental`s the result into the cache. Refresh must not collapse the chain to a single source or bypass the fallback semantics. Same principle for EMV's `fallback_path`.

### Pipeline + retrain

- `bootstrap_data.run_pipeline(refresh: bool = False)` iterates `SOURCE_SPECS`, calling each fetcher with `refresh`.
- `scripts/retrain.py` calls `run_pipeline(refresh=True)`.
- **Retrain freshness guard — two layers, both must pass:**
  1. **Per-source (primary).** For each entry in `SOURCE_SPECS`, read its refreshed cache's last index and evaluate `is_stale(cache_last, asof, cadence)`. A **missing or empty cache counts as stale** (the EMV fallback path can return a stale snapshot without writing `cache_path`, so "absent" must not pass). If *any* source is stale → loud WARNING (naming the stale source + its cache-last date, or "no usable cache") and `sys.exit(1)`. This is the layer that catches a stale forward-filled monthly source (e.g. EMV) that the panel end cannot see, and a single-source refresh failure that left a good-looking panel.
  2. **Panel-end (defense-in-depth).** `panel.index.max()` vs `last_confirmed_trading_day(asof)`, tolerance `RETRAIN_STALENESS_TOLERANCE_DAYS`. Per-source freshness already implies a fresh panel end, so this layer exists to catch a *different* bug — the merge/feature-build step dropping recent rows even when all sources are current.

  `--allow-stale` overrides **both** layers (offline/dev runs, or legitimately-late monthly publication). `--dry-run` is unaffected (it exits before fetch).

  **Why per-source is required, not panel-end alone:** EMV is monthly and forward-filled into a daily panel, so its cache-last is *structurally* always behind `panel.index.max()` — a panel-end check is permanently blind to EMV staleness. Combined with keep-cache-on-failure (a failed EMV refresh silently retains an old cache while the panel still ends at the SPY date), a panel-end-only guard would re-admit the exact silent-stale-retrain bug this spec exists to kill, one source at a time.

---

## Data flow

```
retrain.py
  → run_pipeline(refresh=True)            # iterates SOURCE_SPECS
      → fetch_spy_history(refresh=True)   # incremental or cache-on-failure
      → fetch_vix_history(refresh=True)   # delta range through full fallback chain
      → fetch_emv(refresh=True)
      → build panel
  → FRESHNESS GUARD (both layers, --allow-stale overrides both):
      1. per-source: any is_stale(source_cache_last, asof, cadence) → WARN(name) + exit(1)
      2. panel-end:  panel.index.max() vs last_confirmed_trading_day(asof) → WARN + exit(1)
  → train → OOF → reliability rebuild → eval_history write
```

A failed live fetch keeps the last-good cache, so the panel still builds — but the per-source guard then catches that source's staleness and aborts. A failed refresh degrades to a **loud abort**, never a silent stale retrain.

## Error handling

- Fetch exception during refresh: caught per-source, WARNING logged, existing cache returned. Never overwrite a good cache with empty/partial data.
- EMV monthly cadence + `EMV_STALENESS_TOLERANCE_DAYS` (45) prevents false-flagging normal publication lag while still aborting on genuinely stale macro data.
- Panel-end tolerance `RETRAIN_STALENESS_TOLERANCE_DAYS` (3) absorbs provider end-of-day lag without masking real staleness.

## Testing (TDD; `respx` for HTTP providers, monkeypatch for yfinance)

`tests/test_freshness.py`:
- `last_confirmed_trading_day` across a weekend and a known US market holiday.
- `is_stale` daily (current vs behind) and monthly (within vs beyond `EMV_STALENESS_TOLERANCE_DAYS`).
- `merge_incremental` dedupes overlapping index and sorts.
- **`merge_incremental` revised-overlap:** new data overlaps an existing index date but with *different column values* → the revised (new) row wins wholesale, no column-level blending.

Fetcher refresh tests (extend existing):
- Cache present + provider returns later rows → cache extended, no duplicate index, sorted.
- Cache present + provider returns *revised* rows for existing dates → revised values persisted (ties to `merge_incremental` semantics).
- Cache present + provider raises → original cache returned unchanged, warning logged.
- Cache present + not stale → no provider call.
- VIX refresh with primary (FRED) failing → falls through to the next source in the chain for the delta range (chain preserved), result merged.

Retrain guard (extend `test_retrain_smoke.py`):
- **Per-source stale, panel-end current:** panel ends at a current trading day but one source's cache (e.g. EMV) is stale beyond tolerance → exit code 1, warning names the stale source, no artifacts written. (This is the test that proves the per-source layer; a panel-end-only guard would pass it.)
- Panel-end stale (all sources behind) → exit code 1, no artifacts written.
- All sources + panel current → proceeds normally.
- Either staleness condition + `--allow-stale` → proceeds with warning.
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
