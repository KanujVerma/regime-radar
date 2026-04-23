"""Finnhub live quote provider — price-card overlay only.

Finnhub free tier provides real-time quotes (/quote endpoint) but does NOT
include US stock OHLC candle data. This provider is used exclusively for
the current-price card on the dashboard. All historical OHLCV data for
feature generation and model inference comes from yfinance.
"""
from __future__ import annotations
from datetime import datetime, timezone
import requests
from src.data.providers.base import LiveQuoteProvider, Quote


class FinnhubProvider(LiveQuoteProvider):
    name = "finnhub"
    mode = "live"

    def __init__(self, api_key: str) -> None:
        self._session = requests.Session()
        self._session.headers.update({"X-Finnhub-Token": api_key})
        self._base_url = "https://finnhub.io/api/v1"

    def latest_quote(self, symbol: str) -> Quote:
        url = f"{self._base_url}/quote"
        try:
            resp = self._session.get(url, params={"symbol": symbol}, timeout=10)
            resp.raise_for_status()
        except requests.RequestException as exc:
            raise RuntimeError(f"Finnhub /quote request failed for {symbol}: {exc}") from exc

        data = resp.json()
        try:
            price = float(data["c"])
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError(
                f"Finnhub /quote response missing 'c' field for {symbol}. Got: {data}"
            ) from exc

        return Quote(
            symbol=symbol,
            price=price,
            volume=0.0,  # Finnhub /quote does not return volume
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
