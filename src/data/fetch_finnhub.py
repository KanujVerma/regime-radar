"""Fetches real-time market data from Finnhub."""
from __future__ import annotations
from src.data.providers import factory


def fetch_recent_quote(symbol: str = "SPY") -> dict:
    """Convenience wrapper: returns latest quote as a plain dict.

    Uses factory.get_provider() to select the active provider.
    Returns: {symbol, price, timestamp}
    """
    provider = factory.get_provider()
    quote = provider.latest_quote(symbol)
    return {
        "symbol": quote.symbol,
        "price": quote.price,
        "timestamp": quote.timestamp,
    }
