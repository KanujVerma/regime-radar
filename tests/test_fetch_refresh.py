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


import src.data.fetch_fred as ff


def _emv_cache(tmp_path, last):
    last_ts = pd.Timestamp(last)
    idx = pd.to_datetime([last_ts - pd.Timedelta(days=31), last_ts])
    df = pd.DataFrame({"emvoverallemv": [10.0, 11.0]}, index=idx)
    df.index.name = "date"
    p = tmp_path / "emv.parquet"
    df.to_parquet(p)
    return p


class _FakeFred:
    def __init__(self, api_key=None): pass

    def get_series(self, series_id, observation_start=None, observation_end=None):
        idx = pd.to_datetime(["2026-02-01", "2026-03-01"])
        return pd.Series([12.0, 13.0], index=idx)


def test_emv_refresh_fresh_skips_download(tmp_path, monkeypatch):
    p = _emv_cache(tmp_path, last="2026-06-10")  # 14d < 45 vs asof -> fresh
    monkeypatch.setenv("FRED_API_KEY", "k")

    class _Boom:
        def __init__(self, api_key=None): raise AssertionError("must not construct Fred when fresh")
    monkeypatch.setattr(ff, "Fred", _Boom, raising=False)
    out = ff.fetch_emv(cache_path=p, refresh=True, asof=date(2026, 6, 24))
    assert out.index.max() == pd.Timestamp("2026-06-10")


def test_emv_refresh_extends_when_stale(tmp_path, monkeypatch):
    p = _emv_cache(tmp_path, last="2026-01-01")  # >45d before today -> stale
    monkeypatch.setenv("FRED_API_KEY", "k")
    monkeypatch.setattr(ff, "Fred", _FakeFred, raising=False)
    out = ff.fetch_emv(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2026-03-01")


def test_emv_refresh_failure_keeps_cache(tmp_path, monkeypatch):
    p = _emv_cache(tmp_path, last="2026-01-01")
    monkeypatch.setenv("FRED_API_KEY", "k")

    class _Boom:
        def __init__(self, api_key=None): pass
        def get_series(self, *a, **k): raise RuntimeError("FRED 500")

    monkeypatch.setattr(ff, "Fred", _Boom, raising=False)
    out = ff.fetch_emv(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2026-01-01")


import src.data.fetch_vix as fv


def _vix_cache(tmp_path, last):
    last_ts = pd.Timestamp(last)
    idx = pd.to_datetime([last_ts - pd.Timedelta(days=3), last_ts])
    df = pd.DataFrame({"vixcls": [15.0, 16.0]}, index=idx)
    df.index.name = "date"
    p = tmp_path / "vix.parquet"
    df.to_parquet(p)
    return p


def test_vix_refresh_fresh_skips_chain(tmp_path, monkeypatch):
    p = _vix_cache(tmp_path, last="2026-06-23")
    def _boom(*a, **k): raise AssertionError("chain must not be called when fresh")
    monkeypatch.setattr(fv, "fetch_fred_series", _boom)
    out = fv.fetch_vix_history(cache_path=p, refresh=True, asof=date(2026, 6, 24))
    assert out.index.max() == pd.Timestamp("2026-06-23")


def test_vix_refresh_uses_chain_for_delta(tmp_path, monkeypatch):
    p = _vix_cache(tmp_path, last="2020-01-02")  # stale
    captured = {}

    def _fake_chain(series_id, start=None, end=None, cache_path=None):
        captured["start"] = start
        captured["cache_path"] = cache_path
        idx = pd.to_datetime(["2020-01-03", "2020-01-06"])
        df = pd.DataFrame({"vixcls": [17.0, 18.0]}, index=idx)
        df.index.name = "date"
        return df

    monkeypatch.setattr(fv, "fetch_fred_series", _fake_chain)
    out = fv.fetch_vix_history(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2020-01-06")
    assert captured["cache_path"] is None       # delta did not reuse cache
    assert captured["start"] == "2020-01-03"     # narrowed range


def test_vix_refresh_failure_keeps_cache(tmp_path, monkeypatch):
    p = _vix_cache(tmp_path, last="2020-01-02")
    monkeypatch.setattr(fv, "fetch_fred_series", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("FRED down")))
    import yfinance as yf
    monkeypatch.setattr(yf, "download", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("yf down")))
    out = fv.fetch_vix_history(cache_path=p, refresh=True)
    assert out.index.max() == pd.Timestamp("2020-01-02")
