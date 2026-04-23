"""Tests for LiveQuoteProvider factory and implementations."""
import pandas as pd
import pytest
from unittest.mock import patch, MagicMock
from src.data.providers.base import LiveQuoteProvider, Quote
from src.data.providers.mock_provider import MockProvider
from src.data.providers.factory import get_provider


class TestMockProvider:
    def test_conforms_to_abc(self):
        p = MockProvider()
        assert isinstance(p, LiveQuoteProvider)
        assert p.mode == "demo"
        assert p.name == "mock"

    def test_latest_quote_returns_quote(self):
        p = MockProvider()
        q = p.latest_quote("SPY")
        assert isinstance(q, Quote)
        assert q.symbol == "SPY"
        assert q.price > 0

    def test_recent_candles_shape(self):
        p = MockProvider()
        df = p.recent_candles("SPY", 30)
        assert len(df) == 30
        assert set(["date", "open", "high", "low", "close", "volume"]).issubset(df.columns)

    def test_deterministic(self):
        p1 = MockProvider()
        p2 = MockProvider()
        q1 = p1.latest_quote("SPY")
        q2 = p2.latest_quote("SPY")
        assert q1.price == q2.price  # same seed = same first bar

    def test_index_advances_and_wraps(self):
        p = MockProvider()
        total = len(p._data)
        prices = [p.latest_quote("SPY").price for _ in range(total + 2)]
        # After full cycle, should wrap back to start
        assert prices[0] == prices[total]


class TestFactory:
    def test_returns_mock_when_no_key(self, monkeypatch):
        monkeypatch.delenv("FINNHUB_API_KEY", raising=False)
        p = get_provider()
        assert p.mode == "demo"

    def test_returns_finnhub_when_key_set(self, monkeypatch):
        monkeypatch.setenv("FINNHUB_API_KEY", "test-key-abc")
        p = get_provider()
        assert p.mode == "live"
        assert p.name == "finnhub"


class TestFinnhubProvider:
    def test_conforms_to_abc(self):
        from src.data.providers.finnhub_provider import FinnhubProvider

        p = FinnhubProvider(api_key="test-key")
        assert isinstance(p, LiveQuoteProvider)
        assert p.mode == "live"
        assert p.name == "finnhub"

    def test_latest_quote_success(self):
        from src.data.providers.finnhub_provider import FinnhubProvider
        import requests

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "c": 450.25, "h": 451.0, "l": 448.0, "o": 449.0, "pc": 449.0
        }

        with patch("requests.Session.get", return_value=mock_resp):
            p = FinnhubProvider(api_key="test-key")
            q = p.latest_quote("SPY")

        assert q.symbol == "SPY"
        assert q.price == pytest.approx(450.25)
        assert q.volume == 0.0  # Finnhub /quote does not return volume

    def test_latest_quote_http_error_raises(self):
        from src.data.providers.finnhub_provider import FinnhubProvider
        import requests

        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = requests.HTTPError("403 Forbidden")

        with patch("requests.Session.get", return_value=mock_resp):
            p = FinnhubProvider(api_key="test-key")
            with pytest.raises(RuntimeError):
                p.latest_quote("SPY")

    def test_no_recent_candles_method(self):
        """FinnhubProvider does not implement recent_candles.
        Finnhub free tier does not include US stock OHLC data.
        Historical OHLCV always comes from yfinance.
        """
        from src.data.providers.finnhub_provider import FinnhubProvider
        p = FinnhubProvider(api_key="test-key")
        assert not hasattr(p, "recent_candles")
