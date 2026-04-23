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
