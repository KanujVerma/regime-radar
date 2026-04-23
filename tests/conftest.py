"""Shared pytest fixtures for RegimeRadar tests."""
import numpy as np
import pandas as pd
import pytest


@pytest.fixture(scope="session")
def synthetic_ohlcv() -> pd.DataFrame:
    """500 trading-day synthetic SPY OHLCV DataFrame.
    DatetimeIndex named 'date', weekdays only, starting 2010-01-04.
    Close follows a random walk with seed=0.
    """
    rng = np.random.default_rng(0)
    n = 500
    dates = pd.bdate_range(start="2010-01-04", periods=n, freq="B")
    log_returns = rng.normal(0.0004, 0.012, size=n)
    close = 400 * np.exp(np.cumsum(log_returns))
    df = pd.DataFrame({
        "open": close * (1 + rng.uniform(-0.005, 0.005, n)),
        "high": close * (1 + rng.uniform(0.0, 0.015, n)),
        "low": close * (1 - rng.uniform(0.0, 0.015, n)),
        "close": close,
        "volume": rng.integers(50_000_000, 120_000_000, n).astype(float),
    }, index=dates)
    df.index.name = "date"
    return df


@pytest.fixture(scope="session")
def synthetic_vix(synthetic_ohlcv) -> pd.DataFrame:
    """Synthetic VIX series aligned to synthetic_ohlcv dates.
    Mean-reverting around 18.
    """
    rng = np.random.default_rng(1)
    n = len(synthetic_ohlcv)
    vix = np.zeros(n)
    vix[0] = 18.0
    for i in range(1, n):
        vix[i] = vix[i-1] + rng.normal(0, 0.5) + 0.05 * (18 - vix[i-1])
    vix = np.clip(vix, 9, 80)
    return pd.DataFrame({"vixcls": vix}, index=synthetic_ohlcv.index)


@pytest.fixture(scope="session")
def synthetic_emv(synthetic_ohlcv) -> pd.DataFrame:
    """Synthetic EMV series — monthly values forward-filled to match OHLCV dates."""
    rng = np.random.default_rng(2)
    # Monthly dates
    monthly = pd.date_range(
        start=synthetic_ohlcv.index[0],
        end=synthetic_ohlcv.index[-1],
        freq="MS",
    )
    emv_monthly = rng.uniform(100, 400, len(monthly))
    emv_series = pd.DataFrame({"emvoverallemv": emv_monthly}, index=monthly)
    # Reindex to OHLCV dates and forward-fill
    emv_daily = emv_series.reindex(synthetic_ohlcv.index).ffill()
    return emv_daily
