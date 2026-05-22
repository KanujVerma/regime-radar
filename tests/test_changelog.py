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


def test_risk_move_threshold_boundary(tmp_path):
    from src.api.routes import _compute_changelog_entries
    d = tmp_path / "daily_state"
    # Below threshold — same regime, vix stable, same driver
    _write_snap(d, "2026-05-20", "calm", 0.10, 15.0)
    _write_snap(d, "2026-05-21", "calm", 0.149, 15.0)  # delta = 0.049 < 0.05
    assert _compute_changelog_entries(d) == []

    # Reset dir
    for f in d.glob("*.json"):
        f.unlink()
    _write_snap(d, "2026-05-20", "calm", 0.10, 15.0)
    _write_snap(d, "2026-05-21", "calm", 0.15, 15.0)   # delta = 0.05 == threshold → hit
    entries = _compute_changelog_entries(d)
    assert len(entries) == 1
    assert "risk_move" in entries[0]["triggers"]


def test_driver_rotation_importance_gate(tmp_path):
    from src.api.routes import _compute_changelog_entries

    d = tmp_path / "daily_state"

    # importance 0.14 — below floor, should NOT fire
    _write_snap(d, "2026-05-20", "calm", 0.10, 15.0, top_feature="vix_pct_504d", importance=0.14)
    _write_snap(d, "2026-05-21", "calm", 0.10, 15.0, top_feature="rv_20d_pct", importance=0.14)
    assert _compute_changelog_entries(d) == []

    for f in d.glob("*.json"):
        f.unlink()

    # importance 0.15 — at floor, should fire
    _write_snap(d, "2026-05-20", "calm", 0.10, 15.0, top_feature="vix_pct_504d", importance=0.20)
    _write_snap(d, "2026-05-21", "calm", 0.10, 15.0, top_feature="rv_20d_pct", importance=0.15)
    entries = _compute_changelog_entries(d)
    assert len(entries) == 1
    assert "driver_rotation" in entries[0]["triggers"]

    for f in d.glob("*.json"):
        f.unlink()

    # current_top_driver is None — should NOT fire
    _write_snap(d, "2026-05-20", "calm", 0.10, 15.0, top_feature="vix_pct_504d", importance=0.20)
    _write_snap(d, "2026-05-21", "calm", 0.10, 15.0, top_feature=None)
    assert _compute_changelog_entries(d) == []

    for f in d.glob("*.json"):
        f.unlink()

    # prior_top_driver is None — should NOT fire
    _write_snap(d, "2026-05-20", "calm", 0.10, 15.0, top_feature=None)
    _write_snap(d, "2026-05-21", "calm", 0.10, 15.0, top_feature="rv_20d_pct", importance=0.20)
    assert _compute_changelog_entries(d) == []


def test_since_filter(tmp_path):
    from src.api.routes import _compute_changelog_entries
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-19", "calm",     0.10, 15.0)
    _write_snap(d, "2026-05-20", "elevated", 0.20, 18.0)  # notable (regime shift)
    _write_snap(d, "2026-05-21", "turbulent", 0.60, 25.0)  # notable (regime shift)
    all_entries = _compute_changelog_entries(d)
    assert len(all_entries) == 2

    # since="2026-05-20" drops the 2026-05-20 entry (current_date <= since)
    filtered = _compute_changelog_entries(d, since="2026-05-20")
    assert len(filtered) == 1
    assert filtered[0]["current_date"] == "2026-05-21"


def test_limit(tmp_path):
    from src.api.routes import _compute_changelog_entries
    d = tmp_path / "daily_state"
    # Realistic business-day dates: Mon 12 → Fri 16 → Mon 19 → Tue 20 → Wed 21
    regimes = ["calm", "elevated", "calm", "elevated", "calm", "elevated"]
    dates = ["2026-05-12", "2026-05-13", "2026-05-14", "2026-05-19", "2026-05-20", "2026-05-21"]
    for date_str, regime in zip(dates, regimes):
        _write_snap(d, date_str, regime, 0.10, 15.0)
    all_entries = _compute_changelog_entries(d, limit=100)
    assert len(all_entries) == 5  # 6 files → 5 pairs, all notable (alternating regime)

    limited = _compute_changelog_entries(d, limit=3)
    assert len(limited) == 3
    # Most-recent-first
    assert limited[0]["current_date"] == "2026-05-21"
    assert limited[1]["current_date"] == "2026-05-20"
    assert limited[2]["current_date"] == "2026-05-19"


def test_narrative_regime_shift(tmp_path):
    from src.api.routes import _compute_changelog_entries
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-20", "calm", 0.10, 15.0)
    _write_snap(d, "2026-05-21", "elevated", 0.24, 18.0)
    e = _compute_changelog_entries(d)[0]
    assert "Calm → Elevated" in e["narrative"]
    assert "+14pp" in e["narrative"]
    assert "24%" in e["narrative"]


def test_narrative_risk_move(tmp_path):
    from src.api.routes import _compute_changelog_entries
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-20", "elevated", 0.10, 15.0)
    _write_snap(d, "2026-05-21", "elevated", 0.15, 15.3)  # delta=0.05, vix_delta=0.3
    e = _compute_changelog_entries(d)[0]
    assert e["primary_trigger"] == "risk_move"
    assert "Transition risk +5pp to 15%" in e["narrative"]
    assert "Elevated" in e["narrative"]


def test_narrative_vix_move(tmp_path):
    from src.api.routes import _compute_changelog_entries
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-20", "elevated", 0.10, 15.0)
    _write_snap(d, "2026-05-21", "elevated", 0.10, 17.0)  # vix_delta=2.0, no risk move
    e = _compute_changelog_entries(d)[0]
    assert e["primary_trigger"] == "vix_move"
    assert "VIX rose 2.0 to 17.0" in e["narrative"]
    assert "10%" in e["narrative"]


def test_narrative_driver_rotation(tmp_path):
    from src.api.routes import _compute_changelog_entries
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-20", "calm", 0.10, 15.0,
                top_feature="vix_pct_504d", importance=0.20, top_label="VIX relative to 2-year history")
    _write_snap(d, "2026-05-21", "calm", 0.10, 15.0,
                top_feature="rv_20d_pct", importance=0.20, top_label="Realized volatility percentile")
    e = _compute_changelog_entries(d)[0]
    assert e["primary_trigger"] == "driver_rotation"
    assert "Realized volatility percentile" in e["narrative"]
    assert "VIX relative to 2-year history" in e["narrative"]


def test_gap_days_and_stale_flag(tmp_path):
    from src.api.routes import _compute_changelog_entries
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-10", "calm",     0.10, 15.0)
    _write_snap(d, "2026-05-21", "elevated", 0.20, 18.0)  # 11-day gap
    entries = _compute_changelog_entries(d)
    assert len(entries) == 1
    e = entries[0]
    assert e["gap_days"] == 11
    assert e["is_stale_gap"] is True

    # Non-stale: 1-day gap
    d2 = tmp_path / "daily_state2"
    _write_snap(d2, "2026-05-20", "calm",     0.10, 15.0)
    _write_snap(d2, "2026-05-21", "elevated", 0.20, 18.0)
    e2 = _compute_changelog_entries(d2)[0]
    assert e2["gap_days"] == 1
    assert e2["is_stale_gap"] is False


def test_most_recent_first_ordering(tmp_path):
    from src.api.routes import _compute_changelog_entries
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-19", "calm",     0.10, 15.0)
    _write_snap(d, "2026-05-20", "elevated", 0.20, 18.0)
    _write_snap(d, "2026-05-21", "turbulent", 0.60, 25.0)
    entries = _compute_changelog_entries(d)
    assert entries[0]["current_date"] == "2026-05-21"
    assert entries[1]["current_date"] == "2026-05-20"


def test_schema_accepts_changelog_entry(tmp_path):
    from src.api.routes import _compute_changelog_entries
    from src.api.schemas import ChangelogResponse
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-20", "calm",     0.10, 15.0)
    _write_snap(d, "2026-05-21", "elevated", 0.24, 18.0)
    entries = _compute_changelog_entries(d)
    obj = ChangelogResponse(
        entries=entries,
        total_notable=len(entries),
        total_days=1,
        earliest_date="2026-05-20",
        latest_date="2026-05-21",
    )
    assert obj.entries[0].primary_trigger == "regime_shift"
    assert obj.entries[0].prior_regime == "calm"
