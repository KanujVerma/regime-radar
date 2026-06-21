# Freshness-Aware Fetch + Retrain Staleness Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the data fetchers refresh stale caches incrementally, and make `scripts/retrain.py` abort loudly (per-source) when it would otherwise train on stale data.

**Architecture:** New pure module `src/data/freshness.py` (calendar + staleness primitives, no I/O). Each fetcher gains a `refresh` flag (+ optional injectable `asof`) that incrementally extends its cache and keeps the old cache on failure. A single `SOURCE_SPECS` registry in `bootstrap_data.py` is iterated by a per-source freshness guard that runs *after the panel merge but before any training*, so a stale retrain cannot mutate artifacts. Missing/empty caches count as stale.

**Tech Stack:** Python 3.11+ (run with `python3.13` on this machine — bare `python3` lacks the deps), pandas, pandas-market-calendars, pytest, monkeypatch.

**Spec:** `docs/superpowers/specs/2026-06-20-freshness-aware-fetch-design.md`

**Decisions locked in this plan:**
- `EMV_STALENESS_TOLERANCE_DAYS = 45` (used everywhere; no other value appears).
- Calendar helper is named `last_confirmed_trading_day` — the most recent session whose close is confirmed available (strictly before `asof`).
- `find_stale_sources` treats a **missing or empty** cache as stale (the FRED fallback path can feed a stale snapshot without writing `cache_path`).
- Fetchers accept optional `asof` (defaults `date.today()`); it gates only the staleness check, not the download range.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/data/freshness.py` | Create | Pure primitives: `last_confirmed_trading_day`, `is_stale`, `merge_incremental`, `stale_reasons`, `StaleDataError`, tolerance constants |
| `tests/test_freshness.py` | Create | Unit tests for all `freshness.py` primitives |
| `src/data/fetch_yfinance.py` | Modify | `refresh` + `asof` on `fetch_spy_history` (daily) |
| `src/data/fetch_fred.py` | Modify | `refresh` + `cadence` + `asof` on `fetch_fred_series`; passthrough on `fetch_emv` (monthly) |
| `src/data/fetch_vix.py` | Modify | `refresh` + `asof` on `fetch_vix_history`, preserving the FRED→yfinance→CSV chain |
| `tests/test_fetch_refresh.py` | Create | Per-fetcher: incremental, revised-row, failure-keeps-cache, fresh-no-call, VIX chain |
| `scripts/bootstrap_data.py` | Modify | `SOURCE_SPECS`, `find_stale_sources`, `run_freshness_guard`, `run_pipeline(refresh, enforce_freshness, asof)` |
| `tests/test_freshness_guard.py` | Create | `find_stale_sources` (fresh/stale/missing) + `run_freshness_guard` incl. EMV-only regression |
| `scripts/retrain.py` | Modify | `--allow-stale`; pass `enforce_freshness`; catch `StaleDataError` → per-line log → exit 1 |
| `tests/test_retrain_smoke.py` | Modify | `--allow-stale` help flag + real stale-abort (SystemExit 1, no eval_history written) |

**Run all tests with:** `python3.13 -m pytest -q`

---

## Task 1: freshness constants + `last_confirmed_trading_day`

**Files:**
- Create: `src/data/freshness.py`
- Test: `tests/test_freshness.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_freshness.py
from datetime import date
from src.data.freshness import (
    last_confirmed_trading_day,
    EMV_STALENESS_TOLERANCE_DAYS,
    RETRAIN_STALENESS_TOLERANCE_DAYS,
)


def test_tolerance_constants_are_named_ints():
    assert EMV_STALENESS_TOLERANCE_DAYS == 45
    assert RETRAIN_STALENESS_TOLERANCE_DAYS == 3


def test_last_confirmed_trading_day_skips_weekend():
    # 2026-01-03 is a Saturday; last confirmed session is Fri 2026-01-02
    assert last_confirmed_trading_day(date(2026, 1, 3)) == date(2026, 1, 2)


def test_last_confirmed_trading_day_skips_holiday():
    # 2025-12-25 (Christmas, Thu) is a market holiday; asof Fri 2025-12-26
    # last confirmed session strictly before 12-26 is Wed 2025-12-24
    assert last_confirmed_trading_day(date(2025, 12, 26)) == date(2025, 12, 24)
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


def last_confirmed_trading_day(asof: date) -> date:
    """The most recent XNYS session whose close is CONFIRMED available as of `asof`.

    Defined as the last session date STRICTLY BEFORE `asof`. This is deliberate:
    today's close does not exist until after today's close, so treating `asof`
    itself as confirmed would cause intraday false-staleness. Do NOT change this to
    "on or before asof" — that reintroduces the intraday flap this name guards against.

    Uses pandas-market-calendars (holiday-correct). src/utils/calendar.py is an
    approximate (days * 5/7) helper and must NOT be used here.
    """
    cal = mcal.get_calendar("XNYS")
    start = asof - timedelta(days=20)  # 20 calendar days always contains >=1 session
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
git commit -m "feat(freshness): add last_confirmed_trading_day and tolerance constants"
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
import pytest
from src.data.freshness import is_stale


def test_is_stale_daily_current_is_fresh():
    # cache through Fri 2026-01-02, asof Sat 2026-01-03 -> fresh
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
        return cl < last_confirmed_trading_day(asof)
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
    return pd.DataFrame({"close": close}, index=pd.to_datetime(dates))


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
    old = pd.DataFrame({"close": [11.0], "volume": [100.0]},
                       index=pd.to_datetime(["2026-01-05"]))
    new = pd.DataFrame({"close": [99.0], "volume": [999.0]},
                       index=pd.to_datetime(["2026-01-05"]))
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

## Task 4: `StaleDataError` (carries reasons) + `stale_reasons`

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
        panel_end=date(2026, 1, 2),
        asof=date(2026, 1, 3),
    )
    assert any("emv" in r and "2026-03-01" in r for r in reasons)


def test_stale_reasons_reports_missing_cache():
    reasons = stale_reasons(
        stale_sources=[("emv", None)],
        panel_end=date(2026, 1, 2),
        asof=date(2026, 1, 3),
    )
    assert any("emv" in r and "no usable cache" in r for r in reasons)


def test_stale_reasons_reports_old_panel():
    reasons = stale_reasons(stale_sources=[], panel_end=date(2025, 12, 1), asof=date(2026, 1, 3))
    assert any("panel" in r for r in reasons)


def test_stale_reasons_empty_when_fresh():
    reasons = stale_reasons(stale_sources=[], panel_end=date(2026, 1, 2), asof=date(2026, 1, 3))
    assert reasons == []


def test_stale_data_error_carries_reasons():
    err = StaleDataError(["a", "b"])
    assert err.reasons == ["a", "b"]
    assert "a" in str(err) and "b" in str(err)
    assert isinstance(err, Exception)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_freshness.py -k "stale_reasons or stale_data_error" -q`
Expected: FAIL — `ImportError: cannot import name 'StaleDataError'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/data/freshness.py  (append)
class StaleDataError(Exception):
    """Raised when a retrain would proceed on data that is not current.

    Carries the individual reasons so callers can log them one per line.
    """

    def __init__(self, reasons: list[str]):
        self.reasons = list(reasons)
        super().__init__("; ".join(self.reasons))


def stale_reasons(stale_sources, panel_end: date, asof: date) -> list[str]:
    """Human-readable staleness reasons; empty list means fresh.

    `stale_sources` is the already-filtered list of (name, cache_last) the
    per-source check flagged; `cache_last` is None for a missing/empty cache.
    The panel-end check is defense-in-depth.
    """
    reasons: list[str] = []
    for name, cache_last in stale_sources:
        if cache_last is None:
            reasons.append(f"source '{name}' has no usable cache (missing or empty)")
        else:
            reasons.append(f"source '{name}' cache ends {cache_last}")
    expected = last_confirmed_trading_day(asof)
    if (expected - panel_end).days > RETRAIN_STALENESS_TOLERANCE_DAYS:
        reasons.append(f"panel ends {panel_end}, expected through {expected}")
    return reasons
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_freshness.py -k "stale_reasons or stale_data_error" -q`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/freshness.py tests/test_freshness.py
git commit -m "feat(freshness): add StaleDataError(reasons) and stale_reasons"
```

---

## Task 5: `refresh` + `asof` on `fetch_spy_history`

**Files:**
- Modify: `src/data/fetch_yfinance.py`
- Test: `tests/test_fetch_refresh.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_fetch_refresh.py
from datetime import date
import pandas as pd
import src.data.fetch_yfinance as fy


def _spy_cache(tmp_path, last):
    last_ts = pd.Timestamp(last)
    idx = pd.to_datetime([last_ts - pd.Timedelta(days=3), last_ts])
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
    def __init__(self, symbol): pass

    def history(self, start=None, end=None, auto_adjust=True):
        idx = pd.to_datetime(["2020-01-03", "2020-01-06"])
        df = pd.DataFrame(
            {"Open": [3.0, 4.0], "High": [3.0, 4.0], "Low": [3.0, 4.0],
             "Close": [3.0, 4.0], "Volume": [30.0, 40.0]},
            index=idx,
        )
        df.index.name = "Date"
        return df


def test_spy_refresh_false_returns_cache_no_call(tmp_path, monkeypatch):
    p = _spy_cache(tmp_path, last="2020-01-02")
    def _boom(s): raise AssertionError("provider must not be called when refresh=False")
    monkeypatch.setattr(fy.yf, "Ticker", _boom)
    out = fy.fetch_spy_history(cache_path=p, refresh=False)
    assert out.index.max() == pd.Timestamp("2020-01-02")


def test_spy_refresh_fresh_skips_download(tmp_path, monkeypatch):
    p = _spy_cache(tmp_path, last="2026-06-23")  # fresh vs asof below
    def _boom(s): raise AssertionError("provider must not be called when cache is fresh")
    monkeypatch.setattr(fy.yf, "Ticker", _boom)
    out = fy.fetch_spy_history(cache_path=p, refresh=True, asof=date(2026, 6, 24))
    assert out.index.max() == pd.Timestamp("2026-06-23")


def test_spy_refresh_stale_extends_cache(tmp_path, monkeypatch):
    p = _spy_cache(tmp_path, last="2020-01-02")  # clearly stale
    monkeypatch.setattr(fy.yf, "Ticker", lambda s: _FakeTicker(s))
    out = fy.fetch_spy_history(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2020-01-06")
    assert out.index.is_unique
    assert pd.read_parquet(p).index.max() == pd.Timestamp("2020-01-06")


def test_spy_refresh_failure_keeps_cache(tmp_path, monkeypatch):
    p = _spy_cache(tmp_path, last="2020-01-02")

    class _Boom:
        def __init__(self, s): pass
        def history(self, **kw): raise RuntimeError("yfinance down")

    monkeypatch.setattr(fy.yf, "Ticker", lambda s: _Boom(s))
    out = fy.fetch_spy_history(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2020-01-02")
    assert pd.read_parquet(p).index.max() == pd.Timestamp("2020-01-02")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_fetch_refresh.py -k spy -q`
Expected: FAIL — `TypeError: fetch_spy_history() got an unexpected keyword argument 'refresh'`

- [ ] **Step 3: Write minimal implementation**

In `src/data/fetch_yfinance.py` add at top: `from datetime import date` and `from src.data.freshness import is_stale, merge_incremental`. Replace `fetch_spy_history`:

```python
def fetch_spy_history(
    start: str = "1993-01-01",
    end: str | None = None,
    cache_path: Path | None = None,
    refresh: bool = False,
    asof: date | None = None,
) -> pd.DataFrame:
    """Download SPY daily OHLCV from yfinance (lowercase cols; adjusted close).

    Cache-first. With refresh=True and a stale cache (per `asof`, default today),
    fetches only the missing tail and merges it in; on fetch failure the existing
    cache is kept.
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
        if not is_stale(cache_last, asof or date.today(), "daily"):
            _logger.info("SPY cache is current (%s); no refresh needed", cache_last.date())
            return cached
        try:
            dl_start = (cache_last + pd.Timedelta(days=1)).date().isoformat()
            merged = merge_incremental(cached, _download(dl_start))
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
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/fetch_yfinance.py tests/test_fetch_refresh.py
git commit -m "feat(fetch): incremental refresh + asof for fetch_spy_history"
```

---

## Task 6: `refresh` + `cadence` + `asof` on `fetch_fred_series`; `fetch_emv` passthrough

**Files:**
- Modify: `src/data/fetch_fred.py`
- Test: `tests/test_fetch_refresh.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_fetch_refresh.py  (append)
import src.data.fetch_fred as ff


def _emv_cache(tmp_path, last):
    last_ts = pd.Timestamp(last)
    idx = pd.to_datetime([last_ts - pd.Timedelta(days=31), last_ts])
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


def test_emv_refresh_fresh_skips_download(tmp_path, monkeypatch):
    p = _emv_cache(tmp_path, last="2026-06-10")  # 14d < 45 vs asof -> fresh
    monkeypatch.setenv("FRED_API_KEY", "k")

    class _Boom:
        def __init__(self, api_key=None): raise AssertionError("must not construct Fred when fresh")
    monkeypatch.setattr(ff, "Fred", _Boom, raising=False)
    out = ff.fetch_emv(cache_path=p, refresh=True, asof=date(2026, 6, 24))
    assert out.index.max() == pd.Timestamp("2026-06-10")


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
    assert out.index.max() == pd.Timestamp("2026-01-01")
```

Note: `fetch_fred_series` currently imports `Fred` inside the function. Move it to a module-level `from fredapi import Fred` so the tests can monkeypatch `ff.Fred`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_fetch_refresh.py -k emv -q`
Expected: FAIL — `TypeError: fetch_emv() got an unexpected keyword argument 'refresh'`

- [ ] **Step 3: Write minimal implementation**

In `src/data/fetch_fred.py`: add module-level `from fredapi import Fred` (remove the in-function import); add `from datetime import date` and `from src.data.freshness import is_stale, merge_incremental`. Replace `fetch_fred_series` and `fetch_emv`:

```python
def fetch_fred_series(
    series_id: str,
    start: str = "1985-01-01",
    end: str | None = None,
    cache_path: Path | None = None,
    refresh: bool = False,
    cadence: str = "daily",
    asof: date | None = None,
) -> pd.DataFrame:
    """Download a FRED series (DatetimeIndex 'date', column series_id.lower()).

    Cache-first; with refresh=True and a stale cache (per `asof`, default today),
    fetch only the missing tail and merge. On fetch failure the existing cache is kept.
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
        if not is_stale(cache_last, asof or date.today(), cadence):
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
    asof: date | None = None,
) -> pd.DataFrame:
    """Download EMV (monthly) from FRED; fall back to a stale snapshot on error."""
    try:
        return fetch_fred_series(
            "EMVOVERALLEMV", start=start, end=end, cache_path=cache_path,
            refresh=refresh, cadence="monthly", asof=asof,
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
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/fetch_fred.py tests/test_fetch_refresh.py
git commit -m "feat(fetch): incremental refresh + cadence + asof for FRED series and EMV"
```

---

## Task 7: `refresh` + `asof` on `fetch_vix_history` (chain preserved)

**Files:**
- Modify: `src/data/fetch_vix.py`
- Test: `tests/test_fetch_refresh.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_fetch_refresh.py  (append)
import src.data.fetch_vix as fv


def _vix_cache(tmp_path, last):
    last_ts = pd.Timestamp(last)
    idx = pd.to_datetime([last_ts - pd.Timedelta(days=3), last_ts])
    df = pd.DataFrame({"vixcls": [15.0, 16.0]}, index=idx)
    df.index.name = "date"
    p = tmp_path / "vix.parquet"
    df.to_parquet(p)
    return p


def test_vix_refresh_fresh_skips_chain(tmp_path, monkeypatch):
    p = _vix_cache(tmp_path, last="2026-06-23")
    def _boom(*a, **k): raise AssertionError("chain must not be called when fresh")
    monkeypatch.setattr(fv, "fetch_fred_series", _boom)
    out = fv.fetch_vix_history(cache_path=p, refresh=True, asof=date(2026, 6, 24))
    assert out.index.max() == pd.Timestamp("2026-06-23")


def test_vix_refresh_uses_chain_for_delta(tmp_path, monkeypatch):
    p = _vix_cache(tmp_path, last="2020-01-02")  # stale
    captured = {}

    def _fake_chain(series_id, start=None, end=None, cache_path=None):
        captured["start"] = start
        captured["cache_path"] = cache_path
        idx = pd.to_datetime(["2020-01-03", "2020-01-06"])
        df = pd.DataFrame({"vixcls": [17.0, 18.0]}, index=idx)
        df.index.name = "date"
        return df

    monkeypatch.setattr(fv, "fetch_fred_series", _fake_chain)
    out = fv.fetch_vix_history(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2020-01-06")
    assert captured["cache_path"] is None       # delta did not reuse cache
    assert captured["start"] == "2020-01-03"     # narrowed range


def test_vix_refresh_failure_keeps_cache(tmp_path, monkeypatch):
    p = _vix_cache(tmp_path, last="2020-01-02")
    monkeypatch.setattr(fv, "fetch_fred_series", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("FRED down")))
    import yfinance as yf
    monkeypatch.setattr(yf, "download", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("yf down")))
    out = fv.fetch_vix_history(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2020-01-02")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_fetch_refresh.py -k vix -q`
Expected: FAIL — `TypeError: fetch_vix_history() got an unexpected keyword argument 'refresh'`

- [ ] **Step 3: Write minimal implementation**

In `src/data/fetch_vix.py` add `from datetime import date` and `from src.data.freshness import is_stale, merge_incremental`. Refactor the existing 3-tier chain into a private `_fetch_vix_chain` (behavior-preserving), and wrap it with a refresh branch:

```python
def fetch_vix_history(
    start: str = "1990-01-01",
    end: str | None = None,
    cache_path: Path | None = None,
    fallback_csv: Path | None = None,
    refresh: bool = False,
    asof: date | None = None,
) -> pd.DataFrame:
    """Fetch VIX daily history via FRED VIXCLS → yfinance ^VIX → fallback_csv.

    Cache-first. With refresh=True and a stale cache (per `asof`, default today),
    the delta range is fetched through the SAME fallback chain (cache_path=None so it
    does not short-circuit) and merged in; on total chain failure the cache is kept.
    """
    if cache_path is not None and Path(cache_path).exists() and refresh:
        cached = pd.read_parquet(cache_path)
        cache_last = cached.index.max()
        if not is_stale(cache_last, asof or date.today(), "daily"):
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

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_fetch_refresh.py -k vix -q`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/fetch_vix.py tests/test_fetch_refresh.py
git commit -m "feat(fetch): incremental refresh + asof for VIX, preserving fallback chain"
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


def _write(tmp_path, name, dates, col):
    df = pd.DataFrame({col: [1.0] * len(dates)}, index=pd.to_datetime(dates))
    df.index.name = "date"
    df.to_parquet(tmp_path / f"{name}.parquet")


def test_source_specs_cover_three_sources():
    names = {s.name for s in bd.SOURCE_SPECS}
    assert names == {"spy", "vix", "emv"}
    cadence = {s.name: s.cadence for s in bd.SOURCE_SPECS}
    assert cadence == {"spy": "daily", "vix": "daily", "emv": "monthly"}


def test_find_stale_sources_flags_stale_ignores_fresh(tmp_path, monkeypatch):
    monkeypatch.setattr(bd, "PROCESSED_DIR", str(tmp_path))
    _write(tmp_path, "spy", ["2026-06-22", "2026-06-23"], "close")
    _write(tmp_path, "vix", ["2026-06-22", "2026-06-23"], "vixcls")
    _write(tmp_path, "emv", ["2026-03-01"], "emvoverallemv")
    stale = bd.find_stale_sources(date(2026, 6, 24))
    names = {n for n, _ in stale}
    assert names == {"emv"}
    assert ("emv", date(2026, 3, 1)) in stale


def test_find_stale_sources_treats_missing_as_stale(tmp_path, monkeypatch):
    monkeypatch.setattr(bd, "PROCESSED_DIR", str(tmp_path))  # empty dir, no caches
    stale = bd.find_stale_sources(date(2026, 6, 24))
    assert set(stale) == {("spy", None), ("vix", None), ("emv", None)}


def test_guard_raises_when_only_emv_stale(tmp_path, monkeypatch):
    # The exact false-negative case: panel + SPY + VIX fresh, EMV stale -> still aborts.
    monkeypatch.setattr(bd, "PROCESSED_DIR", str(tmp_path))
    _write(tmp_path, "spy", ["2026-06-22", "2026-06-23"], "close")
    _write(tmp_path, "vix", ["2026-06-22", "2026-06-23"], "vixcls")
    _write(tmp_path, "emv", ["2026-03-01"], "emvoverallemv")
    panel = pd.DataFrame({"y": [1.0]}, index=pd.to_datetime(["2026-06-23"]))
    with pytest.raises(StaleDataError) as ei:
        bd.run_freshness_guard(panel, asof=date(2026, 6, 24), enforce_freshness=True)
    assert any("emv" in r for r in ei.value.reasons)


def test_guard_noop_when_disabled(monkeypatch):
    panel = pd.DataFrame({"x": [1.0]}, index=pd.to_datetime(["2020-01-02"]))
    monkeypatch.setattr(bd, "find_stale_sources", lambda asof: [("emv", date(2019, 1, 1))])
    bd.run_freshness_guard(panel, asof=date(2026, 1, 3), enforce_freshness=False)  # no raise


def test_guard_passes_when_fresh(monkeypatch):
    panel = pd.DataFrame({"x": [1.0]}, index=pd.to_datetime(["2026-01-02"]))
    monkeypatch.setattr(bd, "find_stale_sources", lambda asof: [])
    bd.run_freshness_guard(panel, asof=date(2026, 1, 3), enforce_freshness=True)  # no raise
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_freshness_guard.py -q`
Expected: FAIL — `AttributeError: module 'scripts.bootstrap_data' has no attribute 'SOURCE_SPECS'`

- [ ] **Step 3: Write minimal implementation**

In `scripts/bootstrap_data.py`, add after the existing imports:

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


def find_stale_sources(asof: date) -> list[tuple[str, date | None]]:
    """Return (name, cache_last_date | None) for each stale source.

    A missing or empty cache is STALE (cache_last=None): the FRED fallback path can
    feed a stale snapshot without writing cache_path, so 'absent' must not pass.
    """
    out: list[tuple[str, date | None]] = []
    for spec in SOURCE_SPECS:
        cache = Path(PROCESSED_DIR) / spec.cache_filename
        if not cache.exists():
            out.append((spec.name, None))
            continue
        df = pd.read_parquet(cache)
        if len(df) == 0:
            out.append((spec.name, None))
            continue
        cache_last = df.index.max()
        if is_stale(cache_last, asof, spec.cadence):
            out.append((spec.name, pd.Timestamp(cache_last).date()))
    return out


def run_freshness_guard(panel, asof: date | None = None, enforce_freshness: bool = True) -> None:
    """Raise StaleDataError (logging each reason on its own line) when stale."""
    if not enforce_freshness:
        return
    asof = asof or date.today()
    reasons = stale_reasons(find_stale_sources(asof), panel.index.max().date(), asof)
    if reasons:
        for r in reasons:
            _logger.warning("stale data: %s", r)
        raise StaleDataError(reasons)
```

Then change `run_pipeline`'s signature and thread `refresh`/`asof` into the three fetch calls, inserting the guard right after `save_panel`:

```python
def run_pipeline(
    refresh: bool = False,
    enforce_freshness: bool = False,
    asof: date | None = None,
) -> dict:
```

Update the three fetch calls:

```python
    spy = fetch_spy_history(start="1993-01-01", cache_path=Path(PROCESSED_DIR) / "spy.parquet", refresh=refresh, asof=asof)
    ...
    vix = fetch_vix_history(start="1990-01-01", cache_path=Path(PROCESSED_DIR) / "vix.parquet", refresh=refresh, asof=asof)
    ...
    emv = fetch_emv(start="1985-01-01", cache_path=Path(PROCESSED_DIR) / "emv.parquet", refresh=refresh, asof=asof)
```

Immediately after `save_panel(panel, Path(PROCESSED_DIR) / "panel.parquet")`:

```python
    # Freshness guard: abort BEFORE any labels/features/training mutate artifacts.
    run_freshness_guard(panel, asof=asof, enforce_freshness=enforce_freshness)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_freshness_guard.py -q`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `python3.13 -m pytest -q`
Expected: PASS (all prior + new).

- [ ] **Step 6: Commit**

```bash
git add scripts/bootstrap_data.py tests/test_freshness_guard.py
git commit -m "feat(pipeline): SOURCE_SPECS + per-source freshness guard before training"
```

---

## Task 9: wire `--allow-stale` + `StaleDataError` handling into `retrain.py`

**Files:**
- Modify: `scripts/retrain.py`
- Test: `tests/test_retrain_smoke.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_retrain_smoke.py  (append; add `import pytest` to the top imports)
def test_allow_stale_flag_is_recognized():
    result = subprocess.run(
        [sys.executable, str(RETRAIN_SCRIPT), "--help"],
        capture_output=True, text=True, cwd=str(RETRAIN_SCRIPT.parent.parent),
    )
    assert result.returncode == 0
    assert "--allow-stale" in result.stdout


def test_retrain_aborts_on_stale_data(monkeypatch):
    """run_pipeline raising StaleDataError -> exit 1, and no eval_history written."""
    import scripts.retrain as rt        # runs retrain top-level: makes 'bootstrap_data' importable
    import bootstrap_data as bd          # the same module name retrain imports inside main()
    from src.data.freshness import StaleDataError

    before = set(EVAL_HISTORY_DIR.glob("*.json")) if EVAL_HISTORY_DIR.exists() else set()

    def _raise(*a, **k):
        raise StaleDataError(["source 'emv' cache ends 2026-03-01"])

    monkeypatch.setattr(bd, "run_pipeline", _raise)
    monkeypatch.setattr(sys, "argv", ["retrain.py"])

    with pytest.raises(SystemExit) as ei:
        rt.main()
    assert ei.value.code == 1

    after = set(EVAL_HISTORY_DIR.glob("*.json")) if EVAL_HISTORY_DIR.exists() else set()
    assert after - before == set()       # later retrain steps (eval history) never ran
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_retrain_smoke.py -q`
Expected: FAIL — `--allow-stale` not in help; `test_retrain_aborts_on_stale_data` errors (no abort path).

- [ ] **Step 3: Write minimal implementation**

In `scripts/retrain.py` `main()`, add the flag next to `--dry-run`:

```python
    parser.add_argument(
        "--allow-stale", action="store_true",
        help="Proceed even if fetched data is not current (per-source staleness guard off)",
    )
```

Replace the `pipeline = run_pipeline()` line (and its preceding `from bootstrap_data import run_pipeline`) with:

```python
    from bootstrap_data import run_pipeline
    from src.data.freshness import StaleDataError
    try:
        pipeline = run_pipeline(refresh=True, enforce_freshness=not args.allow_stale)
    except StaleDataError as exc:
        for reason in exc.reasons:
            _logger.warning("stale: %s", reason)
        _logger.warning("Aborting retrain on stale data. Re-run with --allow-stale to override.")
        sys.exit(1)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_retrain_smoke.py -q`
Expected: PASS (dry-run smoke + `--allow-stale` flag + stale-abort).

- [ ] **Step 5: Verify dry-run still exits cleanly end-to-end**

Run: `python3.13 scripts/retrain.py --dry-run`
Expected: exits 0; logs "Pre-retrain snapshot loaded …" then "--dry-run: exiting cleanly".

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

- `python3.13 -m pytest -q` is green (existing 119 + new freshness/guard/fetch/retrain tests).
- `python3.13 scripts/retrain.py` aborts non-zero with a per-source reason when a source cache is stale or missing (e.g. EMV at 2026-03-01), logging each reason on its own line; `--allow-stale` overrides it.
- `python3.13 scripts/retrain.py --dry-run` still exits 0 and writes nothing.
- A normal `bootstrap_data.main()` run is unchanged (guard off by default; `enforce_freshness=False`).

## Notes for the implementer

- **Interpreter:** always `python3.13` here; bare `python3` lacks joblib/xgboost/etc.
- **Environment caveat:** this machine's live data may not reach today (caches end ~2026-05-22), so a real `python3.13 scripts/retrain.py` will likely *abort by design*. All refresh/guard logic is verified via the mocked tests above, which need no live network.
- **`test_retrain_aborts_on_stale_data` coupling:** it calls the real `rt.main()`, which runs the pre-retrain snapshot read (needs the committed `data/models/` artifacts present — they are) before hitting the mocked `run_pipeline`. It does not write anything.
- **TDD discipline:** write the test, watch it fail, implement, watch it pass, commit. One task at a time.
