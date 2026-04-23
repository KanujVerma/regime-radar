"""Abstract base class for live market-quote providers."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import ClassVar, Literal
import pandas as pd


@dataclass
class Quote:
    symbol: str
    price: float
    volume: float
    timestamp: str  # ISO-8601


class LiveQuoteProvider(ABC):
    name: ClassVar[str]
    mode: ClassVar[Literal["live", "demo"]]

    @abstractmethod
    def latest_quote(self, symbol: str) -> Quote: ...

    @abstractmethod
    def recent_candles(self, symbol: str, n: int) -> pd.DataFrame:
        """Return a DataFrame with columns: date, open, high, low, close, volume.
        Rows ordered oldest-first. At least n rows."""
        ...
