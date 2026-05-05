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

    Sources tried in order: FRED VIXCLS → yfinance ^VIX → fallback_csv.

    Returns DataFrame with DatetimeIndex named 'date' and column 'vixcls'.
    """
    try:
        df = fetch_fred_series("VIXCLS", start=start, end=end, cache_path=cache_path)
        _logger.info("VIX loaded from FRED (VIXCLS)")
        return df
    except Exception as exc:
        _logger.warning("FRED VIXCLS fetch failed: %s", exc)

    # Secondary: yfinance ^VIX (same data, different source)
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
        if cache_path is not None:
            Path(cache_path).parent.mkdir(parents=True, exist_ok=True)
            df.to_parquet(cache_path)
            _logger.info("Cached yfinance ^VIX to %s", cache_path)
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
