"""Fetches VIX data for volatility signals."""
from __future__ import annotations
from datetime import date
from pathlib import Path
import pandas as pd
from src.utils.logging import get_logger
from src.data.fetch_fred import fetch_fred_series
from src.data.freshness import is_stale, merge_incremental

_logger = get_logger(__name__)


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
