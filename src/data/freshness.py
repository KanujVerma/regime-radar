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
