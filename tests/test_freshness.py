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


def test_merge_tz_naive_old_tz_aware_new_does_not_raise():
    # Production path: cache is tz-naive, real yfinance delta is tz-aware (America/New_York).
    # pd.concat of a tz-naive + tz-aware index raises TypeError; merge_incremental must absorb it.
    old = _frame(["2026-01-02", "2026-01-05"], [10.0, 11.0])  # tz-naive
    new = pd.DataFrame(
        {"close": [12.0, 13.0]},
        index=pd.to_datetime(["2026-01-06", "2026-01-07"]).tz_localize("America/New_York"),
    )
    out = merge_incremental(old, new)
    assert out.index.is_unique
    assert list(out.index) == sorted(out.index)
    assert out.index.tz is None
    assert list(out.index) == list(pd.to_datetime(
        ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"]))
    assert out["close"].tolist() == [10.0, 11.0, 12.0, 13.0]


def test_merge_tz_aware_old_tz_naive_new_does_not_raise():
    # Reverse mix: tz-aware cache, tz-naive delta. Must also merge cleanly.
    old = pd.DataFrame(
        {"close": [10.0, 11.0]},
        index=pd.to_datetime(["2026-01-02", "2026-01-05"]).tz_localize("America/New_York"),
    )
    new = _frame(["2026-01-06", "2026-01-07"], [12.0, 13.0])  # tz-naive
    out = merge_incremental(old, new)
    assert out.index.is_unique
    assert out.index.tz is None
    assert list(out.index) == list(pd.to_datetime(
        ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"]))


def test_merge_revised_row_wins_across_tz_boundary():
    # Same wall-clock date in tz-naive old and tz-aware new must dedupe to the NEW row.
    old = pd.DataFrame({"close": [11.0]}, index=pd.to_datetime(["2026-01-05"]))  # tz-naive
    new = pd.DataFrame(
        {"close": [99.0]},
        index=pd.to_datetime(["2026-01-05"]).tz_localize("America/New_York"),
    )
    out = merge_incremental(old, new)
    assert len(out) == 1
    assert out.loc[pd.Timestamp("2026-01-05"), "close"] == 99.0


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
