"""Merges SPY, VIX, and EMV data sources into a single aligned panel."""
import pandas as pd
import numpy as np
import pathlib
from src.utils.logging import get_logger

_logger = get_logger(__name__)


def merge_market_panel(
    spy_df: pd.DataFrame,
    vix_df: pd.DataFrame,
    emv_df: pd.DataFrame,
) -> pd.DataFrame:
    """Merge SPY OHLCV, VIX, and EMV into a daily aligned DataFrame.

    Rules:
    - Index is SPY's trading calendar (NYSE business days)
    - VIX is forward-filled to match SPY dates (VIX has same calendar but may have NaN gaps)
    - EMV is monthly; forward-fill to daily. Values are NOT interpolated (publish-date forward-fill).
    - Rows with NaN close or VIX in the first trailing_window_days are allowed (handled downstream).
    - Rows with all-NaN dropped.

    Returns DataFrame with columns:
    open, high, low, close, volume, vixcls, emvoverallemv
    """
    def _strip_tz(idx):
        idx = pd.to_datetime(idx)
        # Use .date to strip tz without time-of-day shift (tz_convert shifts midnight ET → 05:00 UTC)
        return pd.DatetimeIndex(idx.date) if idx.tz is not None else idx

    spy = spy_df.copy()
    spy.index = _strip_tz(spy.index)

    vix = vix_df.copy()
    vix.index = _strip_tz(vix.index)

    emv = emv_df.copy()
    emv.index = _strip_tz(emv.index)

    # Align to SPY dates
    panel = spy.join(vix, how="left").join(emv, how="left")

    # Forward-fill both (VIX for occasional NaN gaps; EMV for monthly→daily)
    panel["vixcls"] = panel["vixcls"].ffill()
    emv_col = [c for c in panel.columns if "emv" in c.lower()][0]
    panel[emv_col] = panel[emv_col].ffill()

    # Standardize column name
    panel = panel.rename(columns={emv_col: "emvoverallemv"})

    panel = panel.dropna(subset=["close"])
    panel = panel.sort_index()

    _logger.info("Merged panel: %d rows, %d cols, %s to %s",
                 len(panel), len(panel.columns),
                 panel.index[0].date(), panel.index[-1].date())
    return panel


def save_panel(df: pd.DataFrame, path) -> None:
    """Save the merged panel to parquet."""
    pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path)


def load_panel(path) -> pd.DataFrame:
    """Load the merged panel from parquet."""
    return pd.read_parquet(path)
