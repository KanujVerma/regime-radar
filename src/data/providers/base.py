"""Abstract base class for live market-quote providers.

Providers supply only a current-price snapshot (latest_quote).
Historical OHLCV data for feature generation and training always comes
from yfinance via fetch_yfinance.py — not from providers.
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import ClassVar, Literal


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
    def latest_quote(self, symbol: str) -> Quote:
        """Return the current price as a Quote snapshot.

        Used only for the price-card on the Current State dashboard page.
        Not used for feature generation, labeling, training, or core inference.
        """
        ...
