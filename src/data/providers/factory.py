"""Selects the appropriate LiveQuoteProvider based on environment configuration."""
import os
from src.utils.logging import get_logger
from src.data.providers.finnhub_provider import FinnhubProvider
from src.data.providers.mock_provider import MockProvider
from src.data.providers.base import LiveQuoteProvider

_logger = get_logger(__name__)


def get_provider() -> LiveQuoteProvider:
    """Returns FinnhubProvider if FINNHUB_API_KEY is set, else MockProvider."""
    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if api_key:
        _logger.info("LiveQuoteProvider: using Finnhub (LIVE mode)")
        return FinnhubProvider(api_key=api_key)
    _logger.info("LiveQuoteProvider: FINNHUB_API_KEY not set — using MockProvider (DEMO mode)")
    return MockProvider()
