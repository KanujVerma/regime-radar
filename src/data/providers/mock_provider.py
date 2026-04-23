"""Mock market data provider for testing and development."""
from __future__ import annotations
from pathlib import Path
import numpy as np
import pandas as pd
from src.data.providers.base import LiveQuoteProvider, Quote
from src.utils.paths import get_project_root


class MockProvider(LiveQuoteProvider):
    name = "mock"
    mode = "demo"

    def __init__(self, fixture_path: str | Path | None = None) -> None:
        if fixture_path is not None and Path(fixture_path).exists():
            self._data = pd.read_parquet(fixture_path)
        else:
            default = get_project_root() / "data" / "fixtures" / "spy_demo.parquet"
            if default.exists():
                self._data = pd.read_parquet(default)
            else:
                self._data = self._generate_synthetic()
        self._idx = 0

    def _generate_synthetic(self) -> pd.DataFrame:
        rng = np.random.default_rng(42)
        n = 500
        dates = pd.bdate_range(start="2020-01-02", periods=n, freq="B")
        log_returns = rng.normal(0.0003, 0.012, size=n)
        close = 400 * np.exp(np.cumsum(log_returns))
        vix = np.zeros(n)
        vix[0] = 18.0
        for i in range(1, n):
            vix[i] = vix[i - 1] + rng.normal(0, 0.5) + 0.05 * (18 - vix[i - 1])
        vix = np.clip(vix, 9, 80)
        df = pd.DataFrame({
            "date": dates.strftime("%Y-%m-%d"),
            "open": close * (1 + rng.uniform(-0.005, 0.005, n)),
            "high": close * (1 + rng.uniform(0.0, 0.015, n)),
            "low": close * (1 - rng.uniform(0.0, 0.015, n)),
            "close": close,
            "volume": rng.integers(50_000_000, 120_000_000, n).astype(float),
        })
        return df

    def latest_quote(self, symbol: str) -> Quote:
        row = self._data.iloc[self._idx]
        self._idx = (self._idx + 1) % len(self._data)
        return Quote(
            symbol=symbol,
            price=float(row["close"]),
            volume=float(row["volume"]),
            timestamp=str(row["date"]),
        )

    def recent_candles(self, symbol: str, n: int) -> pd.DataFrame:
        total = len(self._data)
        end = self._idx if self._idx > 0 else total
        if end >= n:
            subset = self._data.iloc[end - n: end].copy()
        else:
            # Wrap around
            needed = n - end
            subset = pd.concat([
                self._data.iloc[total - needed:].copy(),
                self._data.iloc[:end].copy(),
            ], ignore_index=True)
        return subset.reset_index(drop=True)
