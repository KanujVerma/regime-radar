"""Fetches macroeconomic data from FRED."""
from __future__ import annotations
import os
from pathlib import Path
import pandas as pd
from src.utils.logging import get_logger

_logger = get_logger(__name__)


def fetch_fred_series(
    series_id: str,
    start: str = "1985-01-01",
    end: str | None = None,
    cache_path: Path | None = None,
) -> pd.DataFrame:
    """Download a FRED data series.

    Returns DataFrame with DatetimeIndex named 'date' and a single column
    named series_id.lower(). Supports cache_path for offline-first operation.
    """
    if cache_path is not None and Path(cache_path).exists():
        _logger.info("Loading FRED %s from cache: %s", series_id, cache_path)
        return pd.read_parquet(cache_path)

    api_key = os.getenv("FRED_API_KEY", "")
    if not api_key:
        raise ValueError("FRED_API_KEY environment variable is required")

    _logger.info("Downloading FRED series %s", series_id)
    from fredapi import Fred
    fred = Fred(api_key=api_key)
    series = fred.get_series(series_id, observation_start=start, observation_end=end)

    col_name = series_id.lower()
    df = pd.DataFrame({col_name: series})
    df.index.name = "date"
    df.index = pd.to_datetime(df.index)

    if cache_path is not None:
        Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(cache_path)
        _logger.info("Cached FRED %s to %s", series_id, cache_path)

    return df


def fetch_emv(
    start: str = "1985-01-01",
    end: str | None = None,
    cache_path: Path | None = None,
) -> pd.DataFrame:
    """Download the Equity Market Volatility (EMV) index from FRED."""
    return fetch_fred_series("EMVOVERALLEMV", start=start, end=end, cache_path=cache_path)
