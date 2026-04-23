"""Selects the appropriate LiveQuoteProvider for the current-price card.

The provider is used ONLY for the price-snapshot card on the dashboard.
yfinance (fetch_yfinance.py) is the required source for all historical OHLCV
data used in feature generation, labeling, training, and core inference.
"""
import os
from src.utils.logging import get_logger
from src.data.providers.finnhub_provider import FinnhubProvider
from src.data.providers.mock_provider import MockProvider
from src.data.providers.base import LiveQuoteProvider

_logger = get_logger(__name__)


def get_provider() -> LiveQuoteProvider:
    """Returns FinnhubProvider if FINNHUB_API_KEY is set (price-card overlay),
    else MockProvider (DEMO mode — deterministic replay, no network calls)."""
    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if api_key:
        _logger.info("Price-card provider: Finnhub (optional live overlay)")
        return FinnhubProvider(api_key=api_key)
    _logger.info("Price-card provider: MockProvider (DEMO — no FINNHUB_API_KEY set)")
    return MockProvider()
