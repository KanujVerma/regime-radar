# src/data/freshness.py
"""Freshness primitives for cache staleness checks (pure, no I/O)."""
from __future__ import annotations
from datetime import date, timedelta
from typing import Literal
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


def is_stale(cache_last, asof: date, cadence: Literal["daily", "monthly"]) -> bool:
    """True if a cache ending at `cache_last` is stale for its cadence as of `asof`."""
    cl = pd.Timestamp(cache_last).date()
    if cadence == "daily":
        return cl < last_confirmed_trading_day(asof)
    if cadence == "monthly":
        return (asof - cl).days > EMV_STALENESS_TOLERANCE_DAYS
    raise ValueError(f"unknown cadence: {cadence!r}")


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
