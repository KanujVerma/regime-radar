from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

_ET = ZoneInfo("America/New_York")
_MARKET_OPEN_H, _MARKET_OPEN_M = 9, 30
_MARKET_CLOSE_H, _MARKET_CLOSE_M = 16, 0


def _to_et(dt: datetime | None) -> datetime:
    if dt is None:
        return datetime.now(_ET)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=_ET)
    return dt.astimezone(_ET)


def is_market_open(dt: datetime | None = None) -> bool:
    et = _to_et(dt)
    if et.weekday() >= 5:
        return False
    open_time = et.replace(hour=_MARKET_OPEN_H, minute=_MARKET_OPEN_M, second=0, microsecond=0)
    close_time = et.replace(hour=_MARKET_CLOSE_H, minute=_MARKET_CLOSE_M, second=0, microsecond=0)
    return open_time <= et < close_time


def next_market_open(dt: datetime | None = None) -> datetime:
    et = _to_et(dt)
    candidate = et.replace(hour=_MARKET_OPEN_H, minute=_MARKET_OPEN_M, second=0, microsecond=0)
    if et >= candidate or et.weekday() >= 5:
        candidate += timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


def trading_days_between(start: date, end: date) -> int:
    total_days = (end - start).days
    if total_days <= 0:
        return 0
    return round(total_days * 5 / 7)
