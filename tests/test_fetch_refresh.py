# tests/test_fetch_refresh.py
from datetime import date
import pandas as pd
import src.data.fetch_yfinance as fy


def _spy_cache(tmp_path, last):
    last_ts = pd.Timestamp(last)
    idx = pd.to_datetime([last_ts - pd.Timedelta(days=3), last_ts])
    df = pd.DataFrame(
        {"open": [1.0, 2.0], "high": [1.0, 2.0], "low": [1.0, 2.0],
         "close": [1.0, 2.0], "volume": [10.0, 20.0]},
        index=idx,
    )
    df.index.name = "date"
    p = tmp_path / "spy.parquet"
    df.to_parquet(p)
    return p


class _FakeTicker:
    def __init__(self, symbol): pass

    def history(self, start=None, end=None, auto_adjust=True):
        idx = pd.to_datetime(["2020-01-03", "2020-01-06"])
        df = pd.DataFrame(
            {"Open": [3.0, 4.0], "High": [3.0, 4.0], "Low": [3.0, 4.0],
             "Close": [3.0, 4.0], "Volume": [30.0, 40.0]},
            index=idx,
        )
        df.index.name = "Date"
        return df


def test_spy_refresh_false_returns_cache_no_call(tmp_path, monkeypatch):
    p = _spy_cache(tmp_path, last="2020-01-02")
    def _boom(s): raise AssertionError("provider must not be called when refresh=False")
    monkeypatch.setattr(fy.yf, "Ticker", _boom)
    out = fy.fetch_spy_history(cache_path=p, refresh=False)
    assert out.index.max() == pd.Timestamp("2020-01-02")


def test_spy_refresh_fresh_skips_download(tmp_path, monkeypatch):
    p = _spy_cache(tmp_path, last="2026-06-23")  # fresh vs asof below
    def _boom(s): raise AssertionError("provider must not be called when cache is fresh")
    monkeypatch.setattr(fy.yf, "Ticker", _boom)
    out = fy.fetch_spy_history(cache_path=p, refresh=True, asof=date(2026, 6, 24))
    assert out.index.max() == pd.Timestamp("2026-06-23")


def test_spy_refresh_stale_extends_cache(tmp_path, monkeypatch):
    p = _spy_cache(tmp_path, last="2020-01-02")  # clearly stale
    monkeypatch.setattr(fy.yf, "Ticker", lambda s: _FakeTicker(s))
    out = fy.fetch_spy_history(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2020-01-06")
    assert out.index.is_unique
    assert pd.read_parquet(p).index.max() == pd.Timestamp("2020-01-06")


def test_spy_refresh_failure_keeps_cache(tmp_path, monkeypatch):
    p = _spy_cache(tmp_path, last="2020-01-02")

    class _Boom:
        def __init__(self, s): pass
        def history(self, **kw): raise RuntimeError("yfinance down")

    monkeypatch.setattr(fy.yf, "Ticker", lambda s: _Boom(s))
    out = fy.fetch_spy_history(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2020-01-02")
    assert pd.read_parquet(p).index.max() == pd.Timestamp("2020-01-02")
