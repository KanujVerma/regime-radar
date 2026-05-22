"""Unit tests for the changelog helper and GET /changelog endpoint."""
import json
from pathlib import Path


def _write_snap(
    directory: Path,
    date_str: str,
    regime: str,
    risk: float,
    vix: float,
    top_feature: str | None = "vix_chg_5d",
    importance: float = 0.20,
    top_label: str = "VIX 5-day change",
) -> None:
    """Write a minimal daily state artifact fixture."""
    drivers = (
        [{"feature": top_feature, "plain_label": top_label, "importance": importance}]
        if top_feature else []
    )
    snap = {
        "as_of_date": date_str,
        "generated_at": f"{date_str}T22:00:00+00:00",
        "data_through_date": date_str,
        "regime": regime,
        "transition_risk": risk,
        "prob_calm": 0.80, "prob_elevated": 0.18, "prob_turbulent": 0.02,
        "vix_level": vix,
        "trend": "uptrend",
        "top_drivers": drivers,
        "model_version": {
            "transition_model": "xgb_transition",
            "transition_trained_as_of": "2026-04-24",
            "regime_model": "xgb_regime",
            "regime_trained_as_of": "2026-04-24",
        },
    }
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{date_str}.json").write_text(json.dumps(snap))


def test_empty_dir(tmp_path):
    from src.api.routes import _compute_changelog_entries
    assert _compute_changelog_entries(tmp_path / "nonexistent") == []


def test_single_file(tmp_path):
    from src.api.routes import _compute_changelog_entries
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-21", "calm", 0.10, 15.0)
    assert _compute_changelog_entries(d) == []


def test_notable_regime_shift(tmp_path):
    from src.api.routes import _compute_changelog_entries
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-20", "calm", 0.10, 15.0)
    _write_snap(d, "2026-05-21", "elevated", 0.24, 18.0)
    entries = _compute_changelog_entries(d)
    assert len(entries) == 1
    e = entries[0]
    assert e["primary_trigger"] == "regime_shift"
    assert "regime_shift" in e["triggers"]
    assert e["current_date"] == "2026-05-21"
    assert e["previous_date"] == "2026-05-20"
    assert e["prior_regime"] == "calm"
    assert e["regime"] == "elevated"


def test_non_notable_small_deltas(tmp_path):
    from src.api.routes import _compute_changelog_entries
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-20", "calm", 0.10, 15.0)
    _write_snap(d, "2026-05-21", "calm", 0.12, 15.3)  # risk_delta=0.02, vix_delta=0.3, same driver
    assert _compute_changelog_entries(d, notable_only=True) == []
    all_entries = _compute_changelog_entries(d, notable_only=False)
    assert len(all_entries) == 1
    assert all_entries[0]["triggers"] == []
    assert all_entries[0]["primary_trigger"] is None
    assert all_entries[0]["narrative"] == "No notable market-state change from the prior snapshot."
