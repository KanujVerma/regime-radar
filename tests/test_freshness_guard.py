# tests/test_freshness_guard.py
from datetime import date
import pandas as pd
import pytest
import scripts.bootstrap_data as bd
from src.data.freshness import StaleDataError


def _write(tmp_path, name, dates, col):
    df = pd.DataFrame({col: [1.0] * len(dates)}, index=pd.to_datetime(dates))
    df.index.name = "date"
    df.to_parquet(tmp_path / f"{name}.parquet")


def test_source_specs_cover_three_sources():
    names = {s.name for s in bd.SOURCE_SPECS}
    assert names == {"spy", "vix", "emv"}
    cadence = {s.name: s.cadence for s in bd.SOURCE_SPECS}
    assert cadence == {"spy": "daily", "vix": "daily", "emv": "monthly"}


def test_find_stale_sources_flags_stale_ignores_fresh(tmp_path, monkeypatch):
    monkeypatch.setattr(bd, "PROCESSED_DIR", str(tmp_path))
    _write(tmp_path, "spy", ["2026-06-22", "2026-06-23"], "close")
    _write(tmp_path, "vix", ["2026-06-22", "2026-06-23"], "vixcls")
    _write(tmp_path, "emv", ["2026-03-01"], "emvoverallemv")
    stale = bd.find_stale_sources(date(2026, 6, 24))
    names = {n for n, _ in stale}
    assert names == {"emv"}
    assert ("emv", date(2026, 3, 1)) in stale


def test_find_stale_sources_treats_missing_as_stale(tmp_path, monkeypatch):
    monkeypatch.setattr(bd, "PROCESSED_DIR", str(tmp_path))  # empty dir, no caches
    stale = bd.find_stale_sources(date(2026, 6, 24))
    assert set(stale) == {("spy", None), ("vix", None), ("emv", None)}


def test_guard_raises_when_only_emv_stale(tmp_path, monkeypatch):
    # The exact false-negative case: panel + SPY + VIX fresh, EMV stale -> still aborts.
    monkeypatch.setattr(bd, "PROCESSED_DIR", str(tmp_path))
    _write(tmp_path, "spy", ["2026-06-22", "2026-06-23"], "close")
    _write(tmp_path, "vix", ["2026-06-22", "2026-06-23"], "vixcls")
    _write(tmp_path, "emv", ["2026-03-01"], "emvoverallemv")
    panel = pd.DataFrame({"y": [1.0]}, index=pd.to_datetime(["2026-06-23"]))
    with pytest.raises(StaleDataError) as ei:
        bd.run_freshness_guard(panel, asof=date(2026, 6, 24), enforce_freshness=True)
    assert any("emv" in r for r in ei.value.reasons)


def test_guard_noop_when_disabled(monkeypatch):
    panel = pd.DataFrame({"x": [1.0]}, index=pd.to_datetime(["2020-01-02"]))
    monkeypatch.setattr(bd, "find_stale_sources", lambda asof: [("emv", date(2019, 1, 1))])
    bd.run_freshness_guard(panel, asof=date(2026, 1, 3), enforce_freshness=False)  # no raise


def test_guard_passes_when_fresh(monkeypatch):
    panel = pd.DataFrame({"x": [1.0]}, index=pd.to_datetime(["2026-01-02"]))
    monkeypatch.setattr(bd, "find_stale_sources", lambda asof: [])
    bd.run_freshness_guard(panel, asof=date(2026, 1, 3), enforce_freshness=True)  # no raise
