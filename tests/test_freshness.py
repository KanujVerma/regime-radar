# tests/test_freshness.py
import pandas as pd
import pytest
from datetime import date
from src.data.freshness import (
    last_confirmed_trading_day,
    EMV_STALENESS_TOLERANCE_DAYS,
    RETRAIN_STALENESS_TOLERANCE_DAYS,
    is_stale,
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
