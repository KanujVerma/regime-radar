"""Fetches VIX data for volatility signals."""
from __future__ import annotations
from pathlib import Path
import pandas as pd
from src.utils.logging import get_logger
from src.data.fetch_fred import fetch_fred_series

_logger = get_logger(__name__)


def fetch_vix_history(
    start: str = "1990-01-01",
    end: str | None = None,
    cache_path: Path | None = None,
    fallback_csv: Path | None = None,
) -> pd.DataFrame:
    """Fetch VIX daily history.

    Primary source: FRED VIXCLS series.
    Fallback: fallback_csv if provided and primary fails.

    Returns DataFrame with DatetimeIndex named 'date' and column 'vixcls'.
    """
    try:
        df = fetch_fred_series("VIXCLS", start=start, end=end, cache_path=cache_path)
        _logger.info("VIX loaded from FRED (VIXCLS)")
        return df
    except Exception as exc:
        _logger.warning("FRED VIXCLS fetch failed: %s", exc)
        if fallback_csv is None:
            raise
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
