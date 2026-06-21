"""Fetches macroeconomic data from FRED."""
from __future__ import annotations
import os
from datetime import date
from pathlib import Path
import pandas as pd
from fredapi import Fred
from src.utils.logging import get_logger
from src.data.freshness import is_stale, merge_incremental

_logger = get_logger(__name__)


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
