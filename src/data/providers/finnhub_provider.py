"""Finnhub live market data provider implementation."""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
import pandas as pd
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
            volume=0.0,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    def recent_candles(self, symbol: str, n: int) -> pd.DataFrame:
        now = datetime.now(timezone.utc)
        from_ts = int((now - timedelta(days=n + 10)).timestamp())
        to_ts = int(now.timestamp())

        url = f"{self._base_url}/stock/candle"
        params = {
            "symbol": symbol,
            "resolution": "D",
            "from": from_ts,
            "to": to_ts,
        }
        try:
            resp = self._session.get(url, params=params, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as exc:
            raise RuntimeError(
                f"Finnhub /stock/candle request failed for {symbol}: {exc}"
            ) from exc

        data = resp.json()
        if data.get("s") == "no_data" or not data.get("c"):
            raise RuntimeError(
                f"Finnhub returned empty candle data for {symbol}. Response status: {data.get('s')}"
            )

        df = pd.DataFrame({
            "date": [datetime.utcfromtimestamp(t).strftime("%Y-%m-%d") for t in data["t"]],
            "open": data["o"],
            "high": data["h"],
            "low": data["l"],
            "close": data["c"],
            "volume": data["v"],
        })
        df = df.sort_values("date").reset_index(drop=True)
        return df.tail(n).reset_index(drop=True)
