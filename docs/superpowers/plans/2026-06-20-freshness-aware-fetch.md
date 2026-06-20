# Freshness-Aware Fetch + Retrain Staleness Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the data fetchers refresh stale caches incrementally, and make `scripts/retrain.py` abort loudly (per-source) when it would otherwise train on stale data.

**Architecture:** New pure module `src/data/freshness.py` (calendar + staleness primitives, no I/O). Each fetcher gains a `refresh` flag that incrementally extends its cache and keeps the old cache on failure. A single `SOURCE_SPECS` registry in `bootstrap_data.py` is iterated by both `run_pipeline` and a per-source freshness guard that runs *after the panel merge but before any training*, so a stale retrain cannot mutate artifacts.

**Tech Stack:** Python 3.11+ (run with `python3.13` on this machine — bare `python3` lacks the deps), pandas, pandas-market-calendars, pytest, monkeypatch.

**Spec:** `docs/superpowers/specs/2026-06-20-freshness-aware-fetch-design.md`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/data/freshness.py` | Create | Pure primitives: `last_expected_trading_day`, `is_stale`, `merge_incremental`, `stale_reasons`, `StaleDataError`, named tolerance constants |
| `tests/test_freshness.py` | Create | Unit tests for all `freshness.py` primitives |
| `src/data/fetch_yfinance.py` | Modify | `refresh` flag on `fetch_spy_history` (daily cadence) |
| `src/data/fetch_fred.py` | Modify | `refresh` + `cadence` on `fetch_fred_series`; `refresh` passthrough on `fetch_emv` (monthly) |
| `src/data/fetch_vix.py` | Modify | `refresh` on `fetch_vix_history`, preserving the FRED→yfinance→CSV chain |
| `tests/test_fetch_refresh.py` | Create | Fetcher refresh behavior (incremental, revised-row, failure-keeps-cache, not-stale-no-call, VIX chain) |
| `scripts/bootstrap_data.py` | Modify | `SOURCE_SPECS`, `find_stale_sources`, `run_freshness_guard`, `run_pipeline(refresh, enforce_freshness, asof)` |
| `tests/test_freshness_guard.py` | Create | `find_stale_sources` (fixtures) + `run_freshness_guard` (raises/doesn't) |
| `scripts/retrain.py` | Modify | `--allow-stale`; pass `enforce_freshness`; catch `StaleDataError` → exit 1 |
| `tests/test_retrain_smoke.py` | Modify | Add `--allow-stale` help-flag smoke assertion (dry-run still clean) |

**Run all tests with:** `python3.13 -m pytest -q`

---

## Task 1: freshness constants + `last_expected_trading_day`

**Files:**
- Create: `src/data/freshness.py`
- Test: `tests/test_freshness.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_freshness.py
from datetime import date
from src.data.freshness import (
    last_expected_trading_day,
    EMV_STALENESS_TOLERANCE_DAYS,
    RETRAIN_STALENESS_TOLERANCE_DAYS,
)


def test_tolerance_constants_are_named_ints():
    assert EMV_STALENESS_TOLERANCE_DAYS == 45
    assert RETRAIN_STALENESS_TOLERANCE_DAYS == 3


def test_last_trading_day_skips_weekend():
    # 2026-01-03 is a Saturday; last session strictly before is Fri 2026-01-02
    assert last_expected_trading_day(date(2026, 1, 3)) == date(2026, 1, 2)


def test_last_trading_day_skips_holiday():
    # 2025-12-25 (Christmas, Thu) is a market holiday; asof Fri 2025-12-26
    # last session strictly before 12-26 is Wed 2025-12-24
    assert last_expected_trading_day(date(2025, 12, 26)) == date(2025, 12, 24)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_freshness.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.data.freshness'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/data/freshness.py
"""Freshness primitives for cache staleness checks (pure, no I/O)."""
from __future__ import annotations
from datetime import date, timedelta
import pandas as pd
import pandas_market_calendars as mcal

# EMV (FRED monthly) publishes ~monthly with lag; 45d headroom avoids
# false-aborting a retrain fired just before a publication.
EMV_STALENESS_TOLERANCE_DAYS = 45
# Daily panel-end defense-in-depth tolerance (absorbs provider end-of-day lag).
RETRAIN_STALENESS_TOLERANCE_DAYS = 3


def last_expected_trading_day(asof: date) -> date:
    """Most recent XNYS session date strictly before `asof`.

    'Strictly before' = the last session whose close is definitely available
    (today's close does not exist until after today's close), which avoids
    intraday false-staleness. Uses pandas-market-calendars (holiday-correct);
    src/utils/calendar.py is intentionally approximate and must not be used here.
    """
    cal = mcal.get_calendar("XNYS")
    start = asof - timedelta(days=20)
    sched = cal.schedule(start_date=start.isoformat(), end_date=asof.isoformat())
    sessions = [ts.date() for ts in sched.index if ts.date() < asof]
    return max(sessions)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_freshness.py -q`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/freshness.py tests/test_freshness.py
git commit -m "feat(freshness): add trading-calendar helper and tolerance constants"
```

---

## Task 2: `is_stale`

**Files:**
- Modify: `src/data/freshness.py`
- Test: `tests/test_freshness.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_freshness.py  (append)
import pandas as pd
from src.data.freshness import is_stale


def test_is_stale_daily_current_is_fresh():
    # cache through Fri 2026-01-02, asof Sat 2026-01-03 -> not stale
    assert is_stale(pd.Timestamp("2026-01-02"), date(2026, 1, 3), "daily") is False


def test_is_stale_daily_behind_is_stale():
    assert is_stale(pd.Timestamp("2025-12-01"), date(2026, 1, 3), "daily") is True


def test_is_stale_monthly_within_tolerance_is_fresh():
    # 40 days < 45 tolerance
    assert is_stale(pd.Timestamp("2026-05-12"), date(2026, 6, 21), "monthly") is False


def test_is_stale_monthly_beyond_tolerance_is_stale():
    # 2026-03-01 -> 2026-06-21 is ~112 days > 45
    assert is_stale(pd.Timestamp("2026-03-01"), date(2026, 6, 21), "monthly") is True


def test_is_stale_unknown_cadence_raises():
    import pytest
    with pytest.raises(ValueError):
        is_stale(pd.Timestamp("2026-01-02"), date(2026, 1, 3), "weekly")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_freshness.py -k is_stale -q`
Expected: FAIL — `ImportError: cannot import name 'is_stale'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/data/freshness.py  (append)
from typing import Literal


def is_stale(cache_last, asof: date, cadence: Literal["daily", "monthly"]) -> bool:
    """True if a cache ending at `cache_last` is stale for its cadence as of `asof`."""
    cl = pd.Timestamp(cache_last).date()
    if cadence == "daily":
        return cl < last_expected_trading_day(asof)
    if cadence == "monthly":
        return (asof - cl).days > EMV_STALENESS_TOLERANCE_DAYS
    raise ValueError(f"unknown cadence: {cadence!r}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_freshness.py -k is_stale -q`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/freshness.py tests/test_freshness.py
git commit -m "feat(freshness): add is_stale with daily/monthly cadence"
```

---

## Task 3: `merge_incremental` (revised row wins wholesale)

**Files:**
- Modify: `src/data/freshness.py`
- Test: `tests/test_freshness.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_freshness.py  (append)
from src.data.freshness import merge_incremental


def _frame(dates, close):
    idx = pd.to_datetime(dates)
    return pd.DataFrame({"close": close}, index=idx)


def test_merge_appends_and_sorts():
    old = _frame(["2026-01-02", "2026-01-05"], [10.0, 11.0])
    new = _frame(["2026-01-06", "2026-01-07"], [12.0, 13.0])
    out = merge_incremental(old, new)
    assert list(out.index) == list(pd.to_datetime(
        ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"]))
    assert out["close"].tolist() == [10.0, 11.0, 12.0, 13.0]


def test_merge_dedupes_no_duplicate_index():
    old = _frame(["2026-01-02", "2026-01-05"], [10.0, 11.0])
    new = _frame(["2026-01-05", "2026-01-06"], [11.5, 12.0])
    out = merge_incremental(old, new)
    assert out.index.is_unique
    assert len(out) == 3


def test_merge_revised_row_wins_wholesale():
    # Overlapping date 2026-01-05 with a REVISED value -> new wins, no blending.
    old = pd.DataFrame(
        {"close": [11.0], "volume": [100.0]},
        index=pd.to_datetime(["2026-01-05"]),
    )
    new = pd.DataFrame(
        {"close": [99.0], "volume": [999.0]},
        index=pd.to_datetime(["2026-01-05"]),
    )
    out = merge_incremental(old, new)
    assert out.loc[pd.Timestamp("2026-01-05"), "close"] == 99.0
    assert out.loc[pd.Timestamp("2026-01-05"), "volume"] == 999.0


def test_merge_empty_old_returns_new_sorted():
    new = _frame(["2026-01-06", "2026-01-02"], [12.0, 10.0])
    out = merge_incremental(pd.DataFrame(), new)
    assert list(out.index) == list(pd.to_datetime(["2026-01-02", "2026-01-06"]))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_freshness.py -k merge -q`
Expected: FAIL — `ImportError: cannot import name 'merge_incremental'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/data/freshness.py  (append)
def merge_incremental(old: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame:
    """Concatenate old+new, keep the NEW row wholesale on index collisions, sort.

    No column-level combine/fill: a revised provider row replaces the cached row
    entirely (providers restate — yfinance adjusted-close, FRED revisions).
    """
    if old is None or len(old) == 0:
        return new.sort_index()
    if new is None or len(new) == 0:
        return old.sort_index()
    combined = pd.concat([old, new])
    combined = combined[~combined.index.duplicated(keep="last")]
    return combined.sort_index()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_freshness.py -k merge -q`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/freshness.py tests/test_freshness.py
git commit -m "feat(freshness): add merge_incremental with revised-row-wins semantics"
```

---

## Task 4: `StaleDataError` + `stale_reasons`

**Files:**
- Modify: `src/data/freshness.py`
- Test: `tests/test_freshness.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_freshness.py  (append)
from src.data.freshness import StaleDataError, stale_reasons


def test_stale_reasons_reports_stale_source():
    reasons = stale_reasons(
        stale_sources=[("emv", date(2026, 3, 1))],
        panel_end=date(2026, 1, 2),   # current vs asof below
        asof=date(2026, 1, 3),
    )
    assert any("emv" in r for r in reasons)


def test_stale_reasons_reports_old_panel():
    reasons = stale_reasons(
        stale_sources=[],
        panel_end=date(2025, 12, 1),  # far behind
        asof=date(2026, 1, 3),
    )
    assert any("panel" in r for r in reasons)


def test_stale_reasons_empty_when_fresh():
    reasons = stale_reasons(
        stale_sources=[],
        panel_end=date(2026, 1, 2),
        asof=date(2026, 1, 3),
    )
    assert reasons == []


def test_stale_data_error_is_exception():
    assert issubclass(StaleDataError, Exception)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_freshness.py -k stale_reasons -q`
Expected: FAIL — `ImportError: cannot import name 'StaleDataError'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/data/freshness.py  (append)
class StaleDataError(Exception):
    """Raised when a retrain would proceed on data that is not current."""


def stale_reasons(stale_sources, panel_end: date, asof: date) -> list[str]:
    """Human-readable staleness reasons; empty list means fresh.

    `stale_sources` is the already-filtered list of (name, cache_last) the
    per-source check flagged. The panel-end check is defense-in-depth.
    """
    reasons = [f"source '{name}' cache ends {cache_last}" for name, cache_last in stale_sources]
    expected = last_expected_trading_day(asof)
    if (expected - panel_end).days > RETRAIN_STALENESS_TOLERANCE_DAYS:
        reasons.append(f"panel ends {panel_end}, expected through {expected}")
    return reasons
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_freshness.py -k stale_reasons -q`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/freshness.py tests/test_freshness.py
git commit -m "feat(freshness): add StaleDataError and stale_reasons"
```

---

## Task 5: `refresh` flag on `fetch_spy_history`

**Files:**
- Modify: `src/data/fetch_yfinance.py`
- Test: `tests/test_fetch_refresh.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_fetch_refresh.py
from datetime import date
import pandas as pd
import pytest
import src.data.fetch_yfinance as fy


def _spy_cache(tmp_path, last="2020-01-02"):
    idx = pd.to_datetime(["2019-12-31", last])
    df = pd.DataFrame(
        {"open": [1.0, 2.0], "high": [1.0, 2.0], "low": [1.0, 2.0],
         "close": [1.0, 2.0], "volume": [10.0, 20.0]},
        index=idx,
    )
    df.index.name = "date"
    p = tmp_path / "spy.parquet"
    df.to_parquet(p)
    return p


class _FakeTicker:
    """Stands in for yf.Ticker; returns rows after the cache end."""
    def __init__(self, symbol):
        pass

    def history(self, start=None, end=None, auto_adjust=True):
        idx = pd.to_datetime(["2020-01-03", "2020-01-06"])
        df = pd.DataFrame(
            {"Open": [3.0, 4.0], "High": [3.0, 4.0], "Low": [3.0, 4.0],
             "Close": [3.0, 4.0], "Volume": [30.0, 40.0]},
            index=idx,
        )
        df.index.name = "Date"
        return df


def test_refresh_false_returns_cache_untouched(tmp_path, monkeypatch):
    p = _spy_cache(tmp_path)
    called = {"n": 0}
    monkeypatch.setattr(fy.yf, "Ticker", lambda s: called.__setitem__("n", called["n"] + 1) or _FakeTicker(s))
    out = fy.fetch_spy_history(cache_path=p, refresh=False)
    assert called["n"] == 0
    assert out.index.max() == pd.Timestamp("2020-01-02")


def test_refresh_stale_extends_cache(tmp_path, monkeypatch):
    p = _spy_cache(tmp_path)  # ends 2020-01-02, clearly stale today
    monkeypatch.setattr(fy.yf, "Ticker", lambda s: _FakeTicker(s))
    out = fy.fetch_spy_history(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2020-01-06")
    assert out.index.is_unique
    # persisted
    assert pd.read_parquet(p).index.max() == pd.Timestamp("2020-01-06")


def test_refresh_fetch_failure_keeps_cache(tmp_path, monkeypatch):
    p = _spy_cache(tmp_path)

    class _Boom:
        def __init__(self, s): pass
        def history(self, **kw): raise RuntimeError("yfinance down")

    monkeypatch.setattr(fy.yf, "Ticker", lambda s: _Boom(s))
    out = fy.fetch_spy_history(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2020-01-02")  # unchanged
    assert pd.read_parquet(p).index.max() == pd.Timestamp("2020-01-02")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_fetch_refresh.py -k spy -q`
Expected: FAIL — `TypeError: fetch_spy_history() got an unexpected keyword argument 'refresh'`

- [ ] **Step 3: Write minimal implementation**

Replace the body of `fetch_spy_history` in `src/data/fetch_yfinance.py`. Add `from datetime import date` and `from src.data.freshness import is_stale, merge_incremental` at the top, then:

```python
def fetch_spy_history(
    start: str = "1993-01-01",
    end: str | None = None,
    cache_path: Path | None = None,
    refresh: bool = False,
) -> pd.DataFrame:
    """Download SPY daily OHLCV from yfinance (lowercase cols; adjusted close).

    Cache-first. With refresh=True and a stale cache, fetches only the missing
    tail and merges it in; on fetch failure the existing cache is kept.
    """
    def _download(dl_start: str) -> pd.DataFrame:
        _logger.info("Downloading SPY from yfinance (start=%s)", dl_start)
        df = yf.Ticker("SPY").history(start=dl_start, end=end, auto_adjust=True)
        df.columns = [c.lower() for c in df.columns]
        df.index.name = "date"
        cols = [c for c in ["open", "high", "low", "close", "volume"] if c in df.columns]
        return df[cols].copy().sort_index()

    if cache_path is not None and Path(cache_path).exists():
        cached = pd.read_parquet(cache_path)
        if not refresh:
            _logger.info("Loading SPY from cache: %s", cache_path)
            return cached
        cache_last = cached.index.max()
        if not is_stale(cache_last, date.today(), "daily"):
            _logger.info("SPY cache is current (%s); no refresh needed", cache_last.date())
            return cached
        try:
            dl_start = (cache_last + pd.Timedelta(days=1)).date().isoformat()
            new = _download(dl_start)
            merged = merge_incremental(cached, new)
            Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
            merged.to_parquet(cache_path)
            _logger.info("Refreshed SPY cache to %s", merged.index.max().date())
            return merged
        except Exception as exc:
            _logger.warning("SPY refresh failed (%s); keeping existing cache", exc)
            return cached

    df = _download(start)
    if cache_path is not None:
        Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(cache_path)
        _logger.info("Cached SPY to %s", cache_path)
    return df
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_fetch_refresh.py -k spy -q`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/fetch_yfinance.py tests/test_fetch_refresh.py
git commit -m "feat(fetch): incremental refresh for fetch_spy_history"
```

---

## Task 6: `refresh` + `cadence` on `fetch_fred_series`; `fetch_emv` passthrough

**Files:**
- Modify: `src/data/fetch_fred.py`
- Test: `tests/test_fetch_refresh.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_fetch_refresh.py  (append)
import src.data.fetch_fred as ff


def _emv_cache(tmp_path, last="2026-01-01"):
    idx = pd.to_datetime(["2025-12-01", last])
    df = pd.DataFrame({"emvoverallemv": [10.0, 11.0]}, index=idx)
    df.index.name = "date"
    p = tmp_path / "emv.parquet"
    df.to_parquet(p)
    return p


class _FakeFred:
    def __init__(self, api_key=None): pass

    def get_series(self, series_id, observation_start=None, observation_end=None):
        idx = pd.to_datetime(["2026-02-01", "2026-03-01"])
        return pd.Series([12.0, 13.0], index=idx)


def test_emv_refresh_extends_when_stale(tmp_path, monkeypatch):
    p = _emv_cache(tmp_path, last="2026-01-01")  # >45d before today -> stale
    monkeypatch.setenv("FRED_API_KEY", "k")
    monkeypatch.setattr(ff, "Fred", _FakeFred, raising=False)
    out = ff.fetch_emv(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2026-03-01")


def test_emv_refresh_failure_keeps_cache(tmp_path, monkeypatch):
    p = _emv_cache(tmp_path, last="2026-01-01")
    monkeypatch.setenv("FRED_API_KEY", "k")

    class _Boom:
        def __init__(self, api_key=None): pass
        def get_series(self, *a, **k): raise RuntimeError("FRED 500")

    monkeypatch.setattr(ff, "Fred", _Boom, raising=False)
    out = ff.fetch_emv(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2026-01-01")  # unchanged
```

Note: `fetch_fred_series` imports `Fred` inside the function (`from fredapi import Fred`). Change it to a module-level import so the test can monkeypatch `ff.Fred` (see Step 3).

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_fetch_refresh.py -k emv -q`
Expected: FAIL — `TypeError: fetch_emv() got an unexpected keyword argument 'refresh'`

- [ ] **Step 3: Write minimal implementation**

In `src/data/fetch_fred.py`: add module-level `from fredapi import Fred` (remove the in-function import), add `from datetime import date` and `from src.data.freshness import is_stale, merge_incremental`. Replace `fetch_fred_series` and `fetch_emv`:

```python
def fetch_fred_series(
    series_id: str,
    start: str = "1985-01-01",
    end: str | None = None,
    cache_path: Path | None = None,
    refresh: bool = False,
    cadence: str = "daily",
) -> pd.DataFrame:
    """Download a FRED series (DatetimeIndex 'date', column series_id.lower()).

    Cache-first; with refresh=True and a stale cache, fetch only the missing tail
    and merge. On fetch failure the existing cache is kept.
    """
    col_name = series_id.lower()

    def _download(dl_start: str) -> pd.DataFrame:
        api_key = os.getenv("FRED_API_KEY", "")
        if not api_key:
            raise ValueError("FRED_API_KEY environment variable is required")
        _logger.info("Downloading FRED series %s (start=%s)", series_id, dl_start)
        series = Fred(api_key=api_key).get_series(
            series_id, observation_start=dl_start, observation_end=end
        )
        df = pd.DataFrame({col_name: series})
        df.index = pd.to_datetime(df.index)
        df.index.name = "date"
        return df.sort_index()

    if cache_path is not None and Path(cache_path).exists():
        cached = pd.read_parquet(cache_path)
        if not refresh:
            _logger.info("Loading FRED %s from cache: %s", series_id, cache_path)
            return cached
        cache_last = cached.index.max()
        if not is_stale(cache_last, date.today(), cadence):
            _logger.info("FRED %s cache is current (%s)", series_id, cache_last.date())
            return cached
        try:
            dl_start = (cache_last + pd.Timedelta(days=1)).date().isoformat()
            merged = merge_incremental(cached, _download(dl_start))
            Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
            merged.to_parquet(cache_path)
            _logger.info("Refreshed FRED %s cache to %s", series_id, merged.index.max().date())
            return merged
        except Exception as exc:
            _logger.warning("FRED %s refresh failed (%s); keeping cache", series_id, exc)
            return cached

    df = _download(start)
    if cache_path is not None:
        Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(cache_path)
        _logger.info("Cached FRED %s to %s", series_id, cache_path)
    return df


def fetch_emv(
    start: str = "1985-01-01",
    end: str | None = None,
    cache_path: Path | None = None,
    fallback_path: Path | None = None,
    refresh: bool = False,
) -> pd.DataFrame:
    """Download EMV (monthly) from FRED; fall back to a stale snapshot on error."""
    try:
        return fetch_fred_series(
            "EMVOVERALLEMV", start=start, end=end, cache_path=cache_path,
            refresh=refresh, cadence="monthly",
        )
    except Exception as exc:
        _logger.warning("FRED EMVOVERALLEMV fetch failed: %s", exc)
        if fallback_path is not None and Path(fallback_path).exists():
            _logger.info("Falling back to stale snapshot: %s", fallback_path)
            return pd.read_parquet(fallback_path)
        raise
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_fetch_refresh.py -k emv -q`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/fetch_fred.py tests/test_fetch_refresh.py
git commit -m "feat(fetch): incremental refresh + cadence for FRED series and EMV"
```

---

## Task 7: `refresh` on `fetch_vix_history` (chain preserved)

**Files:**
- Modify: `src/data/fetch_vix.py`
- Test: `tests/test_fetch_refresh.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_fetch_refresh.py  (append)
import src.data.fetch_vix as fv


def _vix_cache(tmp_path, last="2020-01-02"):
    idx = pd.to_datetime(["2019-12-31", last])
    df = pd.DataFrame({"vixcls": [15.0, 16.0]}, index=idx)
    df.index.name = "date"
    p = tmp_path / "vix.parquet"
    df.to_parquet(p)
    return p


def test_vix_refresh_uses_chain_for_delta(tmp_path, monkeypatch):
    p = _vix_cache(tmp_path)  # ends 2020-01-02, stale today
    captured = {}

    def _fake_chain(series_id, start=None, end=None, cache_path=None):
        # delta fetch must pass cache_path=None and a narrowed start
        captured["start"] = start
        captured["cache_path"] = cache_path
        idx = pd.to_datetime(["2020-01-03", "2020-01-06"])
        df = pd.DataFrame({"vixcls": [17.0, 18.0]}, index=idx)
        df.index.name = "date"
        return df

    monkeypatch.setattr(fv, "fetch_fred_series", _fake_chain)
    out = fv.fetch_vix_history(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2020-01-06")
    assert captured["cache_path"] is None          # delta did not reuse cache
    assert captured["start"] == "2020-01-03"        # narrowed range


def test_vix_refresh_failure_keeps_cache(tmp_path, monkeypatch):
    p = _vix_cache(tmp_path)

    def _boom(*a, **k): raise RuntimeError("FRED down")

    # Force the whole chain to fail for the delta: FRED raises, yfinance raises.
    monkeypatch.setattr(fv, "fetch_fred_series", _boom)
    import yfinance as yf
    monkeypatch.setattr(yf, "download", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("yf down")))
    out = fv.fetch_vix_history(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2020-01-02")  # unchanged
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_fetch_refresh.py -k vix -q`
Expected: FAIL — `TypeError: fetch_vix_history() got an unexpected keyword argument 'refresh'`

- [ ] **Step 3: Write minimal implementation**

In `src/data/fetch_vix.py`, add `from datetime import date` and `from src.data.freshness import is_stale, merge_incremental`. Add a `refresh` param and a stale-refresh branch that runs the **existing chain** over a narrowed range with `cache_path=None`, then merges. Keep the original cold-path chain unchanged.

```python
def fetch_vix_history(
    start: str = "1990-01-01",
    end: str | None = None,
    cache_path: Path | None = None,
    fallback_csv: Path | None = None,
    refresh: bool = False,
) -> pd.DataFrame:
    """Fetch VIX daily history via FRED VIXCLS → yfinance ^VIX → fallback_csv.

    Cache-first. With refresh=True and a stale cache, the delta range is fetched
    through the SAME fallback chain (cache_path=None so it does not short-circuit)
    and merged in; on total chain failure the existing cache is kept.
    """
    if cache_path is not None and Path(cache_path).exists() and refresh:
        cached = pd.read_parquet(cache_path)
        cache_last = cached.index.max()
        if not is_stale(cache_last, date.today(), "daily"):
            _logger.info("VIX cache is current (%s)", cache_last.date())
            return cached
        delta_start = (cache_last + pd.Timedelta(days=1)).date().isoformat()
        try:
            delta = _fetch_vix_chain(delta_start, end, fallback_csv)
            merged = merge_incremental(cached, delta)
            Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
            merged.to_parquet(cache_path)
            _logger.info("Refreshed VIX cache to %s", merged.index.max().date())
            return merged
        except Exception as exc:
            _logger.warning("VIX refresh failed (%s); keeping cache", exc)
            return cached

    if cache_path is not None and Path(cache_path).exists():
        _logger.info("Loading VIX from cache: %s", cache_path)
        return pd.read_parquet(cache_path)

    df = _fetch_vix_chain(start, end, fallback_csv)
    if cache_path is not None:
        Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(cache_path)
        _logger.info("Cached VIX to %s", cache_path)
    return df


def _fetch_vix_chain(start, end, fallback_csv) -> pd.DataFrame:
    """FRED VIXCLS → yfinance ^VIX → CSV, returning a 'vixcls' frame. No caching."""
    try:
        df = fetch_fred_series("VIXCLS", start=start, end=end, cache_path=None)
        _logger.info("VIX loaded from FRED (VIXCLS)")
        return df
    except Exception as exc:
        _logger.warning("FRED VIXCLS fetch failed: %s", exc)

    try:
        import yfinance as yf
        _logger.info("Falling back to yfinance ^VIX")
        raw = yf.download("^VIX", start=start, end=end, progress=False, auto_adjust=False)
        if raw.empty:
            raise ValueError("yfinance ^VIX returned empty DataFrame")
        close = raw["Close"].iloc[:, 0] if isinstance(raw.columns, pd.MultiIndex) else raw["Close"]
        df = pd.DataFrame({"vixcls": close})
        df.index = pd.to_datetime(df.index)
        df.index.name = "date"
        _logger.info("VIX loaded from yfinance ^VIX")
        return df
    except Exception as exc2:
        _logger.warning("yfinance ^VIX fallback failed: %s", exc2)

    if fallback_csv is None:
        raise RuntimeError("All VIX sources failed (FRED, yfinance); no fallback_csv provided")
    _logger.info("Falling back to CSV: %s", fallback_csv)
    raw = pd.read_csv(fallback_csv, parse_dates=True)
    date_col = raw.columns[0]
    raw[date_col] = pd.to_datetime(raw[date_col])
    raw = raw.set_index(date_col)
    raw.index.name = "date"
    value_col = raw.columns[0]
    if value_col != "vixcls":
        raw = raw.rename(columns={value_col: "vixcls"})
    raw = raw[["vixcls"]]
    if start:
        raw = raw[raw.index >= pd.Timestamp(start)]
    if end:
        raw = raw[raw.index <= pd.Timestamp(end)]
    return raw
```

This refactors the existing 3-tier chain into `_fetch_vix_chain` (behavior-preserving) and adds the refresh branch around it. The original cold-path caching now lives at the end of `fetch_vix_history` (previously the FRED path cached via `cache_path`; with `cache_path=None` in the chain, caching is done once by the caller — equivalent end state).

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_fetch_refresh.py -k vix -q`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/fetch_vix.py tests/test_fetch_refresh.py
git commit -m "feat(fetch): incremental refresh for VIX, preserving fallback chain"
```

---

## Task 8: `SOURCE_SPECS`, `find_stale_sources`, `run_freshness_guard`, `run_pipeline` wiring

**Files:**
- Modify: `scripts/bootstrap_data.py`
- Test: `tests/test_freshness_guard.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_freshness_guard.py
from datetime import date
import pandas as pd
import pytest
import scripts.bootstrap_data as bd
from src.data.freshness import StaleDataError


def test_source_specs_cover_three_sources():
    names = {s.name for s in bd.SOURCE_SPECS}
    assert names == {"spy", "vix", "emv"}
    cadence = {s.name: s.cadence for s in bd.SOURCE_SPECS}
    assert cadence["emv"] == "monthly"
    assert cadence["spy"] == "daily"


def test_find_stale_sources_flags_old_cache(tmp_path, monkeypatch):
    # Point PROCESSED_DIR at a temp dir with a stale emv cache only.
    monkeypatch.setattr(bd, "PROCESSED_DIR", str(tmp_path))
    emv = pd.DataFrame({"emvoverallemv": [1.0]}, index=pd.to_datetime(["2026-01-01"]))
    emv.index.name = "date"
    emv.to_parquet(tmp_path / "emv.parquet")
    stale = bd.find_stale_sources(date(2026, 6, 21))
    assert ("emv", date(2026, 1, 1)) in stale


def test_run_freshness_guard_raises_on_stale(monkeypatch):
    panel = pd.DataFrame({"x": [1.0]}, index=pd.to_datetime(["2026-01-02"]))
    monkeypatch.setattr(bd, "find_stale_sources", lambda asof: [("emv", date(2026, 1, 1))])
    with pytest.raises(StaleDataError):
        bd.run_freshness_guard(panel, asof=date(2026, 1, 3), enforce_freshness=True)


def test_run_freshness_guard_noop_when_disabled(monkeypatch):
    panel = pd.DataFrame({"x": [1.0]}, index=pd.to_datetime(["2020-01-02"]))
    monkeypatch.setattr(bd, "find_stale_sources", lambda asof: [("emv", date(2019, 1, 1))])
    # enforce_freshness=False -> never raises even though data is ancient
    bd.run_freshness_guard(panel, asof=date(2026, 1, 3), enforce_freshness=False)


def test_run_freshness_guard_passes_when_fresh(monkeypatch):
    panel = pd.DataFrame({"x": [1.0]}, index=pd.to_datetime(["2026-01-02"]))
    monkeypatch.setattr(bd, "find_stale_sources", lambda asof: [])
    bd.run_freshness_guard(panel, asof=date(2026, 1, 3), enforce_freshness=True)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_freshness_guard.py -q`
Expected: FAIL — `AttributeError: module 'scripts.bootstrap_data' has no attribute 'SOURCE_SPECS'`

- [ ] **Step 3: Write minimal implementation**

In `scripts/bootstrap_data.py`, add near the top (after the existing imports):

```python
from dataclasses import dataclass
from datetime import date
from pathlib import Path
import pandas as pd

from src.data.freshness import is_stale, stale_reasons, StaleDataError


@dataclass(frozen=True)
class SourceSpec:
    name: str
    cache_filename: str
    cadence: str  # "daily" | "monthly"


SOURCE_SPECS = [
    SourceSpec("spy", "spy.parquet", "daily"),
    SourceSpec("vix", "vix.parquet", "daily"),
    SourceSpec("emv", "emv.parquet", "monthly"),
]


def find_stale_sources(asof: date) -> list[tuple[str, date]]:
    """Return (name, cache_last_date) for each source whose cache is stale.

    Reads the on-disk caches (already refreshed by run_pipeline). Missing or
    empty caches are skipped (a cold source is downloaded fresh, not 'stale').
    """
    out: list[tuple[str, date]] = []
    for spec in SOURCE_SPECS:
        cache = Path(PROCESSED_DIR) / spec.cache_filename
        if not cache.exists():
            continue
        df = pd.read_parquet(cache)
        if len(df) == 0:
            continue
        cache_last = df.index.max()
        if is_stale(cache_last, asof, spec.cadence):
            out.append((spec.name, pd.Timestamp(cache_last).date()))
    return out


def run_freshness_guard(panel, asof: date | None = None, enforce_freshness: bool = True) -> None:
    """Raise StaleDataError if data is stale and enforce_freshness is on."""
    if not enforce_freshness:
        return
    asof = asof or date.today()
    reasons = stale_reasons(find_stale_sources(asof), panel.index.max().date(), asof)
    if reasons:
        raise StaleDataError("Refusing to retrain on stale data: " + "; ".join(reasons))
```

Then change `run_pipeline`'s signature and thread `refresh` into the three fetch calls, and insert the guard right after `save_panel`:

```python
def run_pipeline(
    refresh: bool = False,
    enforce_freshness: bool = False,
    asof: date | None = None,
) -> dict:
```

Inside, update the three fetch calls to pass `refresh=refresh`:

```python
    spy = fetch_spy_history(start="1993-01-01", cache_path=Path(PROCESSED_DIR) / "spy.parquet", refresh=refresh)
    ...
    vix = fetch_vix_history(start="1990-01-01", cache_path=Path(PROCESSED_DIR) / "vix.parquet", refresh=refresh)
    ...
    emv = fetch_emv(start="1985-01-01", cache_path=Path(PROCESSED_DIR) / "emv.parquet", refresh=refresh)
```

And immediately after `save_panel(panel, Path(PROCESSED_DIR) / "panel.parquet")`:

```python
    # Freshness guard: abort BEFORE any training mutates artifacts.
    run_freshness_guard(panel, asof=asof, enforce_freshness=enforce_freshness)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_freshness_guard.py -q`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `python3.13 -m pytest -q`
Expected: PASS (all prior tests + the new ones)

- [ ] **Step 6: Commit**

```bash
git add scripts/bootstrap_data.py tests/test_freshness_guard.py
git commit -m "feat(pipeline): SOURCE_SPECS registry + per-source freshness guard before training"
```

---

## Task 9: wire `--allow-stale` + `StaleDataError` handling into `retrain.py`

**Files:**
- Modify: `scripts/retrain.py`
- Test: `tests/test_retrain_smoke.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_retrain_smoke.py  (append)
def test_allow_stale_flag_is_recognized():
    """--allow-stale must be a real flag (present in --help), proving it is wired."""
    result = subprocess.run(
        [sys.executable, str(RETRAIN_SCRIPT), "--help"],
        capture_output=True, text=True, cwd=str(RETRAIN_SCRIPT.parent.parent),
    )
    assert result.returncode == 0
    assert "--allow-stale" in result.stdout
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_retrain_smoke.py::test_allow_stale_flag_is_recognized -q`
Expected: FAIL — `--allow-stale` not in help output

- [ ] **Step 3: Write minimal implementation**

In `scripts/retrain.py` `main()`, add the flag next to `--dry-run`:

```python
    parser.add_argument(
        "--allow-stale", action="store_true",
        help="Proceed even if fetched data is not current (per-source staleness guard off)",
    )
```

Replace the `run_pipeline()` call (the line `pipeline = run_pipeline()`) with a guarded call:

```python
    from bootstrap_data import run_pipeline
    from src.data.freshness import StaleDataError
    try:
        pipeline = run_pipeline(refresh=True, enforce_freshness=not args.allow_stale)
    except StaleDataError as exc:
        _logger.warning("%s", exc)
        _logger.warning("Aborting retrain. Re-run with --allow-stale to override.")
        sys.exit(1)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_retrain_smoke.py -q`
Expected: PASS (dry-run smoke + new flag test)

- [ ] **Step 5: Verify dry-run still exits cleanly end-to-end**

Run: `python3.13 scripts/retrain.py --dry-run`
Expected: exits 0, logs "Pre-retrain snapshot loaded …" then "--dry-run: exiting cleanly".

- [ ] **Step 6: Run the full suite**

Run: `python3.13 -m pytest -q`
Expected: PASS (all tests).

- [ ] **Step 7: Commit**

```bash
git add scripts/retrain.py tests/test_retrain_smoke.py
git commit -m "feat(retrain): force refresh + abort on stale data with --allow-stale override"
```

---

## Done-when

- `python3.13 -m pytest -q` is green (existing 119 + new freshness/guard/fetch tests).
- `python3.13 scripts/retrain.py` aborts non-zero with a per-source reason when a source cache is stale (e.g. EMV at 2026-03-01), and `--allow-stale` overrides it.
- `python3.13 scripts/retrain.py --dry-run` still exits 0 and writes nothing.
- A normal `bootstrap_data.main()` run is unchanged (guard off by default; `enforce_freshness=False`).

## Notes for the implementer

- **Interpreter:** always `python3.13` here; bare `python3` lacks joblib/xgboost/etc.
- **Environment caveat:** this machine's live data may not reach today (caches end ~2026-05-22). That means a real `python3.13 scripts/retrain.py` will likely *abort by design* (correct behavior). All refresh/guard logic is verified via the mocked tests above, which do not need live network.
- **TDD discipline:** write the test, watch it fail, implement, watch it pass, commit. One task at a time.
