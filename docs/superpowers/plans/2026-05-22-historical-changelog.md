# Historical Changelog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `GET /changelog` endpoint that diffs consecutive daily state artifacts to produce a "notable days" feed, and render it as a third Panel on the History page.

**Architecture:** `_compute_changelog_entries()` reads all `data/daily_state/*.json` files, diffs consecutive pairs, applies materiality thresholds, and returns notable entries most-recent-first. The endpoint wraps the helper with 404/200 semantics and query-param filtering. The frontend `ChangelogFeed` component renders the C-with-sub-line timeline format inside History.tsx.

**Tech Stack:** Python / FastAPI / Pydantic (backend); React 18 / TypeScript / Tailwind (frontend); pytest (tests); Vitest installed but no `@testing-library/react` — component rendering tests skipped.

---

## File map

| File | Action |
|---|---|
| `src/api/schemas.py` | Add `ChangelogEntry`, `ChangelogResponse` |
| `src/api/routes.py` | Add `DRIVER_ROTATION_MIN_IMPORTANCE`, `_compute_changelog_entries()`, `GET /changelog` |
| `tests/test_changelog.py` | New — 15 unit tests for helper |
| `tests/test_api_smoke.py` | Add `TestChangelogEndpoint` (2 smoke tests) |
| `frontend/src/types/api.ts` | Append `ChangelogEntry`, `ChangelogResponse` |
| `frontend/src/api/client.ts` | Add `changelog()` method |
| `frontend/src/hooks/useChangelog.ts` | New |
| `frontend/src/components/ui/ChangelogFeed.tsx` | New |
| `frontend/src/pages/History.tsx` | Add third Panel with `<ChangelogFeed />` |

---

## Task 1: Pydantic schemas

**Files:**
- Modify: `src/api/schemas.py` (after the `DailyDiffResponse` block at the end)

- [ ] **Step 1: Add `ChangelogEntry` and `ChangelogResponse` to `src/api/schemas.py`**

Append after the last class in the file:

```python
class ChangelogEntry(BaseModel):
    current_date: str
    previous_date: str | None
    gap_days: int
    is_stale_gap: bool              # gap_days > 5
    regime: str
    transition_risk: float
    risk_delta: float
    vix_level: float | None
    vix_delta: float | None
    trend: str
    prior_regime: str | None
    prior_trend: str | None
    top_driver: DailyDriverEntry | None
    prior_top_driver: DailyDriverEntry | None
    triggers: list[str]
    primary_trigger: str | None     # None when triggers is empty
    narrative: str


class ChangelogResponse(BaseModel):
    entries: list[ChangelogEntry]   # most-recent-first
    total_notable: int
    total_days: int
    earliest_date: str | None
    latest_date: str | None
```

- [ ] **Step 2: Verify existing tests still pass**

```bash
pytest tests/ -x -q
```

Expected: all green (no changes to logic, schemas-only addition).

- [ ] **Step 3: Commit**

```bash
git add src/api/schemas.py
git commit -m "feat: add ChangelogEntry and ChangelogResponse schemas"
```

---

## Task 2: Write failing tests for `_compute_changelog_entries` (part 1)

**Files:**
- Create: `tests/test_changelog.py`

- [ ] **Step 1: Create `tests/test_changelog.py` with the fixture helper and first four tests**

```python
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
```

- [ ] **Step 2: Verify tests fail (function does not exist yet)**

```bash
pytest tests/test_changelog.py -x -q
```

Expected: `ImportError` or `AttributeError` — `_compute_changelog_entries` not defined.

---

## Task 3: Implement `_compute_changelog_entries`

**Files:**
- Modify: `src/api/routes.py`

- [ ] **Step 1: Add the constant and helper to `src/api/routes.py`**

Add after the `FEATURE_PLAIN_LABELS` dict (before `_compute_daily_diff`):

```python
DRIVER_ROTATION_MIN_IMPORTANCE = 0.15


def _compute_changelog_entries(
    daily_state_dir: Path,
    limit: int = 50,
    since: str | None = None,
    notable_only: bool = True,
) -> list[dict]:
    """Diff consecutive daily state artifacts and return notable entries most-recent-first.

    Returns [] when daily_state_dir has < 2 files. Never raises HTTP exceptions.
    """
    if not daily_state_dir.exists():
        return []
    files = sorted(daily_state_dir.glob("*.json"))
    if len(files) < 2:
        return []

    entries = []
    for i in range(1, len(files)):
        current_data = json.loads(files[i].read_text())
        previous_data = json.loads(files[i - 1].read_text())

        current_date = current_data["as_of_date"]
        previous_date = previous_data["as_of_date"]
        gap_days = (date.fromisoformat(current_date) - date.fromisoformat(previous_date)).days

        risk_delta = round(current_data["transition_risk"] - previous_data["transition_risk"], 4)

        cur_vix = current_data.get("vix_level")
        prev_vix = previous_data.get("vix_level")
        vix_delta = round(cur_vix - prev_vix, 2) if (cur_vix is not None and prev_vix is not None) else None

        cur_top = current_data["top_drivers"][0] if current_data["top_drivers"] else None
        prev_top = previous_data["top_drivers"][0] if previous_data["top_drivers"] else None

        # Compute triggers
        triggers: list[str] = []
        if current_data["regime"] != previous_data["regime"]:
            triggers.append("regime_shift")
        if abs(risk_delta) >= 0.05:
            triggers.append("risk_move")
        if vix_delta is not None and abs(vix_delta) >= 1.5:
            triggers.append("vix_move")
        if (
            cur_top is not None
            and prev_top is not None
            and cur_top["feature"] != prev_top["feature"]
            and cur_top.get("importance", 0.0) >= DRIVER_ROTATION_MIN_IMPORTANCE
        ):
            triggers.append("driver_rotation")

        # Primary trigger: highest priority
        primary_trigger: str | None = None
        for t in ("regime_shift", "risk_move", "vix_move", "driver_rotation"):
            if t in triggers:
                primary_trigger = t
                break

        # Narrative
        regime = current_data["regime"].title()
        prior_regime = previous_data["regime"].title()
        risk_pct = f"{current_data['transition_risk'] * 100:.0f}%"
        risk_delta_pp = f"{risk_delta * 100:+.0f}pp"

        if primary_trigger == "regime_shift":
            narrative = f"{prior_regime} → {regime}. Risk {risk_delta_pp} to {risk_pct}."
        elif primary_trigger == "risk_move":
            narrative = f"Transition risk {risk_delta_pp} to {risk_pct}. Regime: {regime}."
        elif primary_trigger == "vix_move":
            direction = "rose" if (vix_delta or 0) > 0 else "fell"
            narrative = f"VIX {direction} {abs(vix_delta or 0):.1f} to {cur_vix:.1f}. Risk {risk_pct}."
        elif primary_trigger == "driver_rotation":
            narrative = (
                f"Top driver shifted to {cur_top['plain_label']} "
                f"(was: {prev_top['plain_label']})."
            )
        else:
            narrative = "No notable market-state change from the prior snapshot."

        entry: dict = {
            "current_date": current_date,
            "previous_date": previous_date,
            "gap_days": gap_days,
            "is_stale_gap": gap_days > 5,
            "regime": current_data["regime"],
            "transition_risk": current_data["transition_risk"],
            "risk_delta": risk_delta,
            "vix_level": cur_vix,
            "vix_delta": vix_delta,
            "trend": current_data["trend"],
            "prior_regime": previous_data["regime"] if "regime_shift" in triggers else None,
            "prior_trend": previous_data["trend"] if current_data["trend"] != previous_data["trend"] else None,
            "top_driver": cur_top,
            "prior_top_driver": prev_top,
            "triggers": triggers,
            "primary_trigger": primary_trigger,
            "narrative": narrative,
        }

        if notable_only and not triggers:
            continue
        if since is not None and current_date <= since:
            continue

        entries.append(entry)

    # Most-recent-first, then apply limit
    entries.reverse()
    return entries[:limit]
```

- [ ] **Step 2: Run part 1 tests to verify they pass**

```bash
pytest tests/test_changelog.py -x -q
```

Expected: 4 tests pass.

---

## Task 4: Write and pass remaining unit tests

**Files:**
- Modify: `tests/test_changelog.py`

- [ ] **Step 1: Append the remaining 11 tests to `tests/test_changelog.py`**

```python
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
    regimes = ["calm", "elevated", "calm", "elevated", "calm", "elevated"]
    dates = ["2026-05-16", "2026-05-17", "2026-05-18", "2026-05-19", "2026-05-20", "2026-05-21"]
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
```

- [ ] **Step 2: Run all changelog tests**

```bash
pytest tests/test_changelog.py -v
```

Expected: all 15 tests pass.

- [ ] **Step 3: Run full test suite to confirm no regressions**

```bash
pytest -x -q
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/api/routes.py tests/test_changelog.py
git commit -m "feat: add _compute_changelog_entries helper with full unit test coverage"
```

---

## Task 5: `GET /changelog` endpoint + smoke tests

**Files:**
- Modify: `src/api/routes.py`
- Modify: `src/api/schemas.py` import block in `routes.py`
- Modify: `tests/test_api_smoke.py`

- [ ] **Step 1: Write failing smoke tests — append to `tests/test_api_smoke.py`**

```python
class TestChangelogEndpoint:
    def test_changelog_200(self, app_with_state, monkeypatch, tmp_path):
        import src.api.routes as routes_mod
        # Two stub files so the file-count check passes
        d = tmp_path / "daily_state"
        d.mkdir()
        (d / "2026-05-20.json").write_text(json.dumps({"as_of_date": "2026-05-20"}))
        (d / "2026-05-21.json").write_text(json.dumps({"as_of_date": "2026-05-21"}))
        monkeypatch.setattr("src.utils.paths.get_project_root", lambda: tmp_path)
        prebuilt = [
            {
                "current_date": "2026-05-21",
                "previous_date": "2026-05-20",
                "gap_days": 1,
                "is_stale_gap": False,
                "regime": "elevated",
                "transition_risk": 0.20,
                "risk_delta": 0.10,
                "vix_level": 18.0,
                "vix_delta": 3.0,
                "trend": "uptrend",
                "prior_regime": "calm",
                "prior_trend": None,
                "top_driver": {
                    "feature": "vix_chg_5d",
                    "plain_label": "VIX 5-day change",
                    "importance": 0.20,
                },
                "prior_top_driver": {
                    "feature": "vix_pct_504d",
                    "plain_label": "VIX relative to 2-year history",
                    "importance": 0.18,
                },
                "triggers": ["regime_shift", "risk_move"],
                "primary_trigger": "regime_shift",
                "narrative": "Calm → Elevated. Risk +10pp to 20%.",
            }
        ]
        monkeypatch.setattr(routes_mod, "_compute_changelog_entries", lambda *a, **kw: prebuilt)
        app, _ = app_with_state
        client = TestClient(app)
        resp = client.get("/changelog")
        assert resp.status_code == 200
        data = resp.json()
        assert "entries" in data
        assert data["entries"][0]["primary_trigger"] == "regime_shift"

    def test_changelog_404_when_fewer_than_two_snapshots(self, app_with_state, monkeypatch, tmp_path):
        monkeypatch.setattr("src.utils.paths.get_project_root", lambda: tmp_path)
        # tmp_path has no daily_state dir → 0 files → 404
        app, _ = app_with_state
        client = TestClient(app)
        resp = client.get("/changelog")
        assert resp.status_code == 404
```

Note: `test_api_smoke.py` imports `json` at the top already. If not, add `import json` to the imports section.

- [ ] **Step 2: Run smoke tests to verify they fail**

```bash
pytest tests/test_api_smoke.py::TestChangelogEndpoint -v
```

Expected: `AttributeError` — `changelog` route does not exist yet.

- [ ] **Step 3: Add `ChangelogResponse` to the schema import block in `src/api/routes.py`**

Find the existing import block (lines 9-15) and add `ChangelogResponse`:

```python
from src.api.schemas import (
    HealthResponse, CurrentStateResponse, HistoricalStateResponse,
    EventReplayResponse, ModelDriversResponse, DriverItem,
    HistoricalPoint, EventReplayPoint, TransitionRiskResponse, TransitionRiskPoint,
    StateDelta, ScenarioRequest, ScenarioResponse, DriverDelta,
    ReliabilityResponse, DailyDiffResponse, ChangelogResponse,
)
```

- [ ] **Step 4: Add `GET /changelog` endpoint to `src/api/routes.py`**

Add after the `daily_diff` endpoint:

```python
@router.get("/changelog", response_model=ChangelogResponse)
async def changelog(limit: int = 50, since: str | None = None, notable_only: bool = True):
    from src.utils.paths import get_project_root
    daily_state_dir = get_project_root() / "data" / "daily_state"
    files = sorted(daily_state_dir.glob("*.json")) if daily_state_dir.exists() else []
    if len(files) < 2:
        raise HTTPException(status_code=404, detail="not enough daily snapshots to compute changelog")
    entries = _compute_changelog_entries(daily_state_dir, limit=limit, since=since, notable_only=notable_only)
    total_notable = len(
        _compute_changelog_entries(daily_state_dir, limit=9999, since=None, notable_only=True)
    )
    return {
        "entries": entries,
        "total_notable": total_notable,
        "total_days": len(files) - 1,
        "earliest_date": json.loads(files[0].read_text()).get("as_of_date"),
        "latest_date": json.loads(files[-1].read_text()).get("as_of_date"),
    }
```

- [ ] **Step 5: Run smoke tests**

```bash
pytest tests/test_api_smoke.py::TestChangelogEndpoint -v
```

Expected: both pass.

- [ ] **Step 6: Run full test suite**

```bash
pytest -x -q
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/api/routes.py src/api/schemas.py tests/test_api_smoke.py
git commit -m "feat: add GET /changelog endpoint with 404/200 semantics"
```

---

## Task 6: Frontend TypeScript types

**Files:**
- Modify: `frontend/src/types/api.ts`

- [ ] **Step 1: Append to `frontend/src/types/api.ts`** (after the `DailyDiffResponse` interface)

```typescript
export interface ChangelogEntry {
  current_date: string
  previous_date: string | null
  gap_days: number
  is_stale_gap: boolean
  regime: string
  transition_risk: number
  risk_delta: number
  vix_level: number | null
  vix_delta: number | null
  trend: string
  prior_regime: string | null
  prior_trend: string | null
  top_driver: DailyDriverEntry | null
  prior_top_driver: DailyDriverEntry | null
  triggers: string[]
  primary_trigger: string | null
  narrative: string
}

export interface ChangelogResponse {
  entries: ChangelogEntry[]
  total_notable: number
  total_days: number
  earliest_date: string | null
  latest_date: string | null
}
```

- [ ] **Step 2: TypeScript compile check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/api.ts
git commit -m "feat: add ChangelogEntry and ChangelogResponse TypeScript types"
```

---

## Task 7: API client method

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add `ChangelogResponse` to the import and add the `changelog` method**

Update the import block at the top of `frontend/src/api/client.ts`:

```typescript
import type {
  CurrentStateResponse,
  HealthResponse,
  HistoricalStateResponse,
  EventReplayResponse,
  ModelDriversResponse,
  ReliabilityResponse,
  ScenarioRequest,
  ScenarioResponse,
  DailyDiffResponse,
  ChangelogResponse,
} from '../types/api'
```

Add to the `api` object (after `dailyDiff`):

```typescript
  changelog: (params?: { limit?: number; since?: string; notable_only?: boolean }) => {
    const qs = params
      ? new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString()
      : ''
    return get<ChangelogResponse>('/changelog' + (qs ? '?' + qs : ''))
  },
```

- [ ] **Step 2: TypeScript compile check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat: add changelog API client method"
```

---

## Task 8: `useChangelog` hook

**Files:**
- Create: `frontend/src/hooks/useChangelog.ts`

- [ ] **Step 1: Create `frontend/src/hooks/useChangelog.ts`**

```typescript
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ChangelogResponse } from '../types/api'

export function useChangelog() {
  const [data, setData] = useState<ChangelogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.changelog({ limit: 20 })
      .then(result => { setData(result); setError(null) })
      .catch(() => { setData(null); setError('Changelog unavailable right now.') })
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}
```

- [ ] **Step 2: TypeScript compile check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useChangelog.ts
git commit -m "feat: add useChangelog hook"
```

---

## Task 9: `ChangelogFeed` component

**Files:**
- Create: `frontend/src/components/ui/ChangelogFeed.tsx`

- [ ] **Step 1: Create `frontend/src/components/ui/ChangelogFeed.tsx`**

```typescript
import type { ChangelogResponse, ChangelogEntry } from '../../types/api'

const REGIME_COLOR: Record<string, string> = {
  calm: '#22c55e',
  elevated: '#f59e0b',
  turbulent: '#ef4444',
}

const TRIGGER_BADGE_COLOR: Record<string, string> = {
  regime_shift: '#f59e0b',
  risk_move: '#ef4444',
  vix_move: '#06b6d4',
  driver_rotation: '#64748b',
}

function badgeLabel(trigger: string, entry: ChangelogEntry): string {
  if (trigger === 'regime_shift') return 'REGIME SHIFT'
  if (trigger === 'risk_move') {
    const pp = Math.round(entry.risk_delta * 100)
    return `RISK ${pp > 0 ? '+' : ''}${pp}pp`
  }
  if (trigger === 'vix_move') {
    const v = entry.vix_delta ?? 0
    return `VIX ${v > 0 ? '+' : ''}${v.toFixed(1)}`
  }
  if (trigger === 'driver_rotation') return 'DRIVER SHIFT'
  return trigger.toUpperCase()
}

function regimeContext(entry: ChangelogEntry): string {
  if (entry.prior_regime) {
    const pr = entry.prior_regime.charAt(0).toUpperCase() + entry.prior_regime.slice(1)
    const cr = entry.regime.charAt(0).toUpperCase() + entry.regime.slice(1)
    return `${pr} → ${cr}`
  }
  const cr = entry.regime.charAt(0).toUpperCase() + entry.regime.slice(1)
  return `Regime: ${cr}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
}

interface Props {
  data: ChangelogResponse
}

export default function ChangelogFeed({ data }: Props) {
  if (data.entries.length === 0) {
    return (
      <p className="text-[10px]" style={{ color: '#64748b' }}>
        No notable changes in the available data.
      </p>
    )
  }

  return (
    <div>
      {data.entries.map((entry, i) => {
        const borderColor = REGIME_COLOR[entry.regime] ?? '#64748b'
        return (
          <div
            key={entry.current_date}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '10px 0',
              borderBottom: i < data.entries.length - 1 ? '1px solid #0f1929' : 'none',
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: '#64748b',
                minWidth: 48,
                fontFamily: 'monospace',
                paddingTop: 2,
              }}
            >
              {formatDate(entry.current_date)}
            </span>
            <div style={{ flex: 1, borderLeft: `2px solid ${borderColor}`, paddingLeft: 10 }}>
              <div
                style={{
                  display: 'flex',
                  gap: 5,
                  alignItems: 'center',
                  marginBottom: 3,
                  flexWrap: 'wrap',
                }}
              >
                {entry.triggers.map(trigger => {
                  const color = TRIGGER_BADGE_COLOR[trigger] ?? '#64748b'
                  return (
                    <span
                      key={trigger}
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 99,
                        background: `${color}1a`,
                        color,
                        border: `1px solid ${color}40`,
                      }}
                    >
                      {badgeLabel(trigger, entry)}
                    </span>
                  )
                })}
                {entry.is_stale_gap && (
                  <span style={{ fontSize: 9, color: '#94a3b8' }}>
                    ⚠ {entry.gap_days}d gap
                  </span>
                )}
                <span style={{ fontSize: 9, color: '#64748b' }}>
                  {regimeContext(entry)}
                </span>
              </div>
              <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                {entry.narrative}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript compile check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/ChangelogFeed.tsx
git commit -m "feat: add ChangelogFeed timeline component"
```

---

## Task 10: History page integration + verification

**Files:**
- Modify: `frontend/src/pages/History.tsx`

- [ ] **Step 1: Update `frontend/src/pages/History.tsx`**

Replace the entire file contents:

```typescript
import { useState } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import RegimeLegend from '../components/ui/RegimeLegend'
import RegimeChart from '../components/charts/RegimeChart'
import RiskLineChart from '../components/charts/RiskLineChart'
import ChangelogFeed from '../components/ui/ChangelogFeed'
import { useHistoricalState } from '../hooks/useHistoricalState'
import { useChangelog } from '../hooks/useChangelog'

export default function History() {
  const [showVix, setShowVix] = useState(false)
  const { data, loading, error } = useHistoricalState()
  const { data: changelog, loading: changelogLoading, error: changelogError } = useChangelog()

  if (loading) return <div className="p-6 text-slate-500 text-sm">Loading…</div>
  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>
  if (!data) return null

  const toggleBtn = (
    <button
      onClick={() => setShowVix(v => !v)}
      className="text-[10px] font-bold px-3 py-1.5 rounded"
      style={{
        background: showVix ? '#0e4d6e' : '#0c1020',
        border: `1px solid ${showVix ? '#06b6d4' : '#151d2e'}`,
        color: showVix ? '#06b6d4' : '#64748b',
      }}
    >
      {showVix ? '▼ Hide VIX' : '▲ Overlay VIX (fear gauge)'}
    </button>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar title="History" subtitle={`${data.start} — ${data.end}`} />
      <div className="p-5 space-y-5">
        <Panel title="What happened over time?">
          <p className="text-[10px] mb-2" style={{ color: '#94a3b8' }}>
            Shaded bands show the market regime on each day. A darker shade indicates higher stress.
          </p>
          <div className="mb-2">
            <RegimeLegend />
          </div>
          <div className="flex justify-end mb-2">{toggleBtn}</div>
          <RegimeChart data={data.data} showVix={showVix} />
        </Panel>
        <Panel title="When did the model get worried?">
          <p className="text-[10px] mb-3" style={{ color: '#94a3b8' }}>
            The line shows the model's daily estimate of the chance conditions worsen within the next week.
          </p>
          <RiskLineChart data={data.data} />
        </Panel>
        <Panel title="Notable days">
          {changelogLoading && (
            <div className="text-slate-500 text-sm">Loading…</div>
          )}
          {changelogError && (
            <div className="text-[10px]" style={{ color: '#64748b' }}>{changelogError}</div>
          )}
          {changelog && <ChangelogFeed data={changelog} />}
        </Panel>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: TypeScript compile check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Build check**

```bash
cd frontend && npm run build
```

Expected: clean build, no TypeScript or Vite errors.

- [ ] **Step 4: Run full backend test suite**

```bash
pytest -x -q
```

Expected: all green.

- [ ] **Step 5: Start both servers and verify in browser**

```bash
# Terminal 1
uvicorn src.api.main:app --reload

# Terminal 2
cd frontend && npm run dev
```

Navigate to `http://localhost:5173/history` (the History route). Verify:
- The "Notable days" panel renders below the two charts
- Entries show left-border colors keyed to regime
- Trigger badges are present (REGIME SHIFT, RISK ±Xpp, etc.)
- Narrative sub-line is visible per entry
- If only 3 artifacts exist, entries may be few but the panel still renders
- If backend is unavailable, "Changelog unavailable right now." is shown instead of a crash

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/History.tsx
git commit -m "feat: add Notable days changelog panel to History page"
```

---

## Final: push to origin

- [ ] **Push all commits**

```bash
git push origin main
```

---

## Out of scope

- Frontend component rendering tests (Vitest installed; `@testing-library/react` is not — skip)
- Dedicated `/changelog` page
- Recent-context preview on Current State
- RSS/Atom feed (next sub-project)
- Filtering UI or month/year grouping headers
