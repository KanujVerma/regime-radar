"""Fetches historical OHLCV data for SPY from yfinance."""
import pandas as pd
import yfinance as yf
from pathlib import Path
from src.utils.logging import get_logger

_logger = get_logger(__name__)


def fetch_spy_history(
    start: str = "1993-01-01",
    end: str | None = None,
    cache_path: Path | None = None,
) -> pd.DataFrame:
    """Download SPY daily OHLCV from yfinance.

    Returns DataFrame with lowercase columns: date (index, DatetimeIndex), open,
    high, low, close, volume. Adjusted close is used for 'close'.

    If cache_path exists, loads from cache. Otherwise downloads and saves to cache_path
    if provided.
    """
    if cache_path is not None and Path(cache_path).exists():
        _logger.info("Loading SPY from cache: %s", cache_path)
        return pd.read_parquet(cache_path)

    _logger.info("Downloading SPY from yfinance (start=%s)", start)
    ticker = yf.Ticker("SPY")
    df = ticker.history(start=start, end=end, auto_adjust=True)

    # Normalize column names
    df.columns = [c.lower() for c in df.columns]
    df.index.name = "date"

    # Keep only needed columns
    cols = [c for c in ["open", "high", "low", "close", "volume"] if c in df.columns]
    df = df[cols].copy()
    df = df.sort_index()

    if cache_path is not None:
        Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(cache_path)
        _logger.info("Cached SPY to %s", cache_path)

    return df
