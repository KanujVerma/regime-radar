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
