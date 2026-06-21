"""Fetches historical OHLCV data for SPY from yfinance."""
from datetime import date
import pandas as pd
import yfinance as yf
from pathlib import Path
from src.utils.logging import get_logger
from src.data.freshness import is_stale, merge_incremental

_logger = get_logger(__name__)


def fetch_spy_history(
    start: str = "1993-01-01",
    end: str | None = None,
    cache_path: Path | None = None,
    refresh: bool = False,
    asof: date | None = None,
) -> pd.DataFrame:
    """Download SPY daily OHLCV from yfinance (lowercase cols; adjusted close).

    Cache-first. With refresh=True and a stale cache (per `asof`, default today),
    fetches only the missing tail and merges it in; on fetch failure the existing
    cache is kept.
    """
    def _download(dl_start: str) -> pd.DataFrame:
        _logger.info("Downloading SPY from yfinance (start=%s)", dl_start)
        df = yf.Ticker("SPY").history(start=dl_start, end=end, auto_adjust=True)
        df.columns = [c.lower() for c in df.columns]
        df.index.name = "date"
        cols = [c for c in ["open", "high", "low", "close", "volume"] if c in df.columns]
        return df[cols].copy().sort_index()

    if cache_path is not None and Path(cache_path).exists():
        cached = pd.read_parquet(cache_path)
        if not refresh:
            _logger.info("Loading SPY from cache: %s", cache_path)
            return cached
        cache_last = cached.index.max()
        if not is_stale(cache_last, asof or date.today(), "daily"):
            _logger.info("SPY cache is current (%s); no refresh needed", cache_last.date())
            return cached
        try:
            dl_start = (cache_last + pd.Timedelta(days=1)).date().isoformat()
            merged = merge_incremental(cached, _download(dl_start))
            Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
            merged.to_parquet(cache_path)
            _logger.info("Refreshed SPY cache to %s", merged.index.max().date())
            return merged
        except Exception as exc:
            _logger.warning("SPY refresh failed (%s); keeping existing cache", exc)
            return cached

    df = _download(start)
    if cache_path is not None:
        Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(cache_path)
        _logger.info("Cached SPY to %s", cache_path)
    return df
