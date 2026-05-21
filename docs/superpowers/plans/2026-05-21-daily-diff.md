# Daily Diff System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a committed `data/daily_state/YYYY-MM-DD.json` artifact per trading day, a `GET /daily-diff` API endpoint, and a "Since yesterday" UI block on the Current State page.

**Architecture:** The nightly cron writes a daily state JSON after fetching data; a one-time bootstrap utility seeds two initial artifacts from git history. The `/daily-diff` endpoint scans committed files, computes a structured diff of the two most recent, and caches the result until next restart. The frontend renders a "Since last trading day / snapshot" block between the transition-risk row and the horizontal divider on Current State, with rows suppressed below meaningful thresholds.

**Tech Stack:** Python 3.11 (FastAPI, Pydantic, pandas), React 18 (TypeScript, Tailwind v4), GitHub Actions

---

## File Map

**New files:**
- `src/models/daily_state.py` — `FEATURE_PLAIN_LABELS` + `build_daily_state(snapshots_dir)`
- `scripts/save_daily_state.py` — cron artifact writer (no date argument — ever)
- `scripts/bootstrap_daily_states.py` — one-time git-history seed utility
- `frontend/src/hooks/useDailyDiff.ts` — React hook
- `data/daily_state/` — committed directory with two bootstrapped artifacts
- `tests/test_daily_state.py` — unit tests for `build_daily_state` and `_compute_daily_diff`

**Modified files:**
- `src/api/schemas.py` — add `DailyDriverEntry`, `DailyModelVersion`, `DailyStateSnapshot`, `DailyTopDriverRef`, `DailyDiff`, `DailyDiffMetadata`, `DailyDiffResponse`
- `src/api/routes.py` — add `_compute_daily_diff()` helper + `GET /daily-diff` endpoint + module-level `import json` + `from pathlib import Path`
- `tests/test_api_smoke.py` — add `TestDailyDiffEndpoint`
- `.github/workflows/update-snapshots.yml` — add artifact step, extend commit to `data/daily_state/`
- `frontend/src/types/api.ts` — add daily diff interfaces
- `frontend/src/api/client.ts` — add `dailyDiff()` + import
- `frontend/src/pages/CurrentState.tsx` — import hook + add `DailyDiffBlock`

---

### Task 1: `src/models/daily_state.py` — shared inference module

**Files:**
- Create: `src/models/daily_state.py`
- Create: `tests/test_daily_state.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_daily_state.py`:

```python
"""Unit tests for daily state artifact builder and diff helper."""
import json
from pathlib import Path
from unittest.mock import patch
import pandas as pd
import numpy as np
import pytest


def _make_panel_parquet(directory: Path) -> None:
    dates = pd.date_range("2026-05-19", periods=3, freq="B")
    df = pd.DataFrame({"vixcls": [15.0, 16.0, 18.0], "close": [500.0, 502.0, 498.0]}, index=dates)
    df.to_parquet(directory / "panel.parquet")


@patch("src.models.daily_state.predict_current_state")
@patch("src.models.daily_state.build_features")
@patch("src.models.daily_state.build_trend_labels")
@patch("src.models.daily_state.build_regime_labels")
@patch("src.models.daily_state.artifact_exists", return_value=True)
@patch("src.models.daily_state.load_metadata", return_value={"saved_at": "2026-04-24"})
def test_build_daily_state_shape(mock_meta, mock_exists, mock_regime, mock_trend, mock_feats, mock_predict, tmp_path):
    from src.models.daily_state import build_daily_state

    _make_panel_parquet(tmp_path)
    dates = pd.date_range("2026-05-19", periods=3, freq="B")
    mock_regime.return_value = pd.Series(["calm", "calm", "elevated"], index=dates)
    mock_trend.return_value = pd.Series(["uptrend", "uptrend", "uptrend"], index=dates)
    mock_feats.return_value = pd.DataFrame(np.zeros((3, 2)), index=dates, columns=["f1", "f2"])
    mock_predict.return_value = {
        "regime": "elevated", "transition_risk": 0.20,
        "prob_calm": 0.30, "prob_elevated": 0.65, "prob_turbulent": 0.05,
        "top_drivers": [{"feature": "vix_chg_5d", "importance": 0.03}],
    }

    result = build_daily_state(tmp_path)

    assert result["regime"] == "elevated"
    assert result["transition_risk"] == 0.20
    assert result["as_of_date"] == result["data_through_date"]
    assert result["vix_level"] == 18.0          # last row vixcls
    assert result["trend"] == "uptrend"
    assert len(result["top_drivers"]) == 1
    driver = result["top_drivers"][0]
    assert driver["feature"] == "vix_chg_5d"
    assert "plain_label" in driver              # enriched with human label
    assert "importance" in driver
    assert result["model_version"]["transition_model"] == "xgb_transition"
    assert result["model_version"]["transition_trained_as_of"] == "2026-04-24"
```

- [ ] **Step 2: Run test to see it fail**

```bash
pytest tests/test_daily_state.py -v
```

Expected: `ModuleNotFoundError` — `src.models.daily_state` doesn't exist yet.

- [ ] **Step 3: Implement `src/models/daily_state.py`**

```python
"""Shared utilities for building the committed daily state artifact."""
from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from src.features.build_market_features import build_features
from src.labeling.build_regime_labels import build_regime_labels
from src.labeling.build_trend_labels import build_trend_labels
from src.models.predict_live import predict_current_state
from src.models.registry import artifact_exists, load_metadata

# Human-readable labels for feature keys (risk-raising SHAP contributors only).
# Semantics: top_drivers in the artifact are positive-SHAP contributors — this
# is documented here, not repeated as a runtime field in every artifact JSON.
FEATURE_PLAIN_LABELS: dict[str, str] = {
    "vix_pct_504d":             "VIX relative to 2-year history",
    "vix_level":                "Current VIX level",
    "vix_zscore_252d":          "VIX z-score (1-year)",
    "vix_chg_5d":               "VIX 5-day change",
    "vix_chg_1d":               "VIX 1-day change",
    "vix_30d_chg":              "VIX 30-day change",
    "rv_20d_pct":               "Realized volatility percentile",
    "drawdown_pct_504d":        "Drawdown relative to 2-year history",
    "ret_20d":                  "20-day SPY return",
    "momentum_20d":             "20-day momentum",
    "dist_sma50":               "Distance from 50-day moving average",
    "emv_level":                "Equity market volatility index",
    "emv_3m_chg":               "EMV 3-month change",
    "days_in_regime_lag1":      "Days in current regime (lagged)",
    "turbulent_count_30d_lag1": "Turbulent days in past 30 days (lagged)",
    "trend_code":               "Trend direction",
}


def build_daily_state(snapshots_dir: Path) -> dict:
    """Run inference on panel.parquet from snapshots_dir and return the daily state dict.

    The artifact date is always derived from the panel's last row — never from a
    caller argument. This prevents synthetic relabeling.
    """
    panel = pd.read_parquet(snapshots_dir / "panel.parquet")
    regime = build_regime_labels(panel)
    trend = build_trend_labels(panel)
    features = build_features(panel, regime_series=regime).dropna()

    result = predict_current_state(features)

    latest_row = panel.iloc[-1]
    as_of_date = str(panel.index[-1].date())
    trend_latest = str(trend.iloc[-1]) if trend is not None and len(trend) > 0 else "neutral"

    enriched_drivers = [
        {
            "feature": d["feature"],
            "plain_label": FEATURE_PLAIN_LABELS.get(d["feature"], d["feature"]),
            "importance": d["importance"],
        }
        for d in result.get("top_drivers", [])
    ]

    t_meta = load_metadata("xgb_transition") if artifact_exists("xgb_transition") else {}
    r_meta = load_metadata("xgb_regime") if artifact_exists("xgb_regime") else {}

    return {
        "as_of_date": as_of_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_through_date": as_of_date,
        "regime": result["regime"],
        "transition_risk": result["transition_risk"],
        "prob_calm": result.get("prob_calm"),
        "prob_elevated": result.get("prob_elevated"),
        "prob_turbulent": result.get("prob_turbulent"),
        "vix_level": float(latest_row["vixcls"]) if "vixcls" in latest_row.index else None,
        "trend": trend_latest,
        "top_drivers": enriched_drivers,
        "model_version": {
            "transition_model": "xgb_transition",
            "transition_trained_as_of": str(t_meta.get("saved_at", "unknown")),
            "regime_model": "xgb_regime",
            "regime_trained_as_of": str(r_meta.get("saved_at", "unknown")),
        },
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_daily_state.py::test_build_daily_state_shape -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/daily_state.py tests/test_daily_state.py
git commit -m "feat: add daily_state module — FEATURE_PLAIN_LABELS + build_daily_state"
```

---

### Task 2: `scripts/save_daily_state.py` — cron artifact writer

**Files:**
- Create: `scripts/save_daily_state.py`

- [ ] **Step 1: Create `scripts/save_daily_state.py`**

```python
#!/usr/bin/env python3
"""Write today's daily state artifact from the current committed snapshots.

Called by the nightly GitHub Actions cron after refresh_snapshots.py has
written fresh parquets to data/snapshots/. No date argument — the artifact
date is always derived from the panel's last row, never from a CLI argument.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models.daily_state import build_daily_state
from src.utils.paths import SNAPSHOTS_DIR, get_project_root


def main() -> None:
    state = build_daily_state(SNAPSHOTS_DIR)
    out_dir = get_project_root() / "data" / "daily_state"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{state['as_of_date']}.json"
    out_path.write_text(json.dumps(state, indent=2))
    print(f"Written: {out_path}  (data through {state['data_through_date']})")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke-run manually**

```bash
python scripts/save_daily_state.py
```

Expected: `Written: data/daily_state/2026-05-21.json  (data through 2026-05-21)`

Check: `cat data/daily_state/2026-05-21.json | python -m json.tool | head -30`

Verify:
- `as_of_date` equals `data_through_date`
- `top_drivers[*].plain_label` is populated (not a raw feature key)
- `model_version.transition_trained_as_of` is not `"unknown"` — if it is, check what key `load_metadata("xgb_transition")` actually returns and adjust the `.get("saved_at", ...)` call in `daily_state.py`

- [ ] **Step 3: Commit**

```bash
git add scripts/save_daily_state.py data/daily_state/
git commit -m "feat: add save_daily_state.py cron artifact writer"
```

---

### Task 3: `scripts/bootstrap_daily_states.py` — seed historical artifacts

**Files:**
- Create: `scripts/bootstrap_daily_states.py`

The date of each artifact comes from the panel parquet's last row — never from a CLI argument. If the date in the artifact doesn't match the commit message date, the script prints a warning but still writes the artifact (the data is authoritative).

- [ ] **Step 1: Create `scripts/bootstrap_daily_states.py`**

```python
#!/usr/bin/env python3
"""Seed daily state artifacts from committed git snapshot history.

One-time utility. Extracts panel.parquet from each recent snapshot commit,
runs inference, writes data/daily_state/YYYY-MM-DD.json. The artifact date
comes from the panel's last row — never from a CLI argument — preventing
synthetic relabeling (writing today's inference under yesterday's filename).
"""
from __future__ import annotations
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models.daily_state import build_daily_state
from src.utils.paths import get_project_root


def find_snapshot_commits(count: int) -> list[tuple[str, str]]:
    """Return [(commit_hash, date_str)] for recent snapshot commits (newest first)."""
    result = subprocess.run(
        ["git", "log", "--format=%H %s", f"-{count * 4}", "--", "data/snapshots/panel.parquet"],
        capture_output=True, text=True, check=True,
    )
    commits: list[tuple[str, str]] = []
    for line in result.stdout.strip().splitlines():
        if not line.strip():
            continue
        hash_, _, subject = line.partition(" ")
        if "update snapshots to " in subject:
            date_str = subject.split("update snapshots to ")[-1].strip()
            commits.append((hash_, date_str))
        if len(commits) >= count:
            break
    return commits


def extract_panel_and_build(commit_hash: str, commit_date: str, output_dir: Path) -> None:
    """Checkout panel.parquet from git commit, run inference, write dated artifact."""
    with tempfile.TemporaryDirectory() as tmp_str:
        tmp = Path(tmp_str)
        panel_bytes = subprocess.run(
            ["git", "show", f"{commit_hash}:data/snapshots/panel.parquet"],
            capture_output=True, check=True,
        ).stdout
        (tmp / "panel.parquet").write_bytes(panel_bytes)
        state = build_daily_state(tmp)

    # Sanity check: artifact date must come from the data, not from commit_date.
    # Print a warning if they differ (e.g. snapshot was one day stale when committed).
    if state["data_through_date"] != commit_date:
        print(f"  NOTE: artifact date {state['data_through_date']} differs "
              f"from commit date {commit_date} — using data date (this is correct)")

    out_path = output_dir / f"{state['as_of_date']}.json"
    out_path.write_text(json.dumps(state, indent=2))
    print(f"  Written: {out_path}  (data through {state['data_through_date']})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=2,
                        help="Number of historical artifacts to generate (default: 2)")
    args = parser.parse_args()

    output_dir = get_project_root() / "data" / "daily_state"
    output_dir.mkdir(parents=True, exist_ok=True)

    commits = find_snapshot_commits(args.count)
    if not commits:
        print("ERROR: No 'chore: update snapshots to YYYY-MM-DD' commits found.")
        sys.exit(1)

    print(f"Generating {len(commits)} artifact(s) from git history...")
    for commit_hash, commit_date in commits:
        print(f"Processing {commit_hash[:8]} (commit date: {commit_date})...")
        extract_panel_and_build(commit_hash, commit_date, output_dir)

    print(f"\nDone. Commit with:")
    print(f"  git add data/daily_state/ && git commit -m 'chore: seed initial daily state artifacts'")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run bootstrap**

```bash
python scripts/bootstrap_daily_states.py --count 2
```

Expected output (dates will vary):
```
Generating 2 artifact(s) from git history...
Processing 01416fa (commit date: 2026-05-20)...
  Written: data/daily_state/2026-05-20.json  (data through 2026-05-20)
Processing 44ade50 (commit date: 2026-05-19)...
  Written: data/daily_state/2026-05-19.json  (data through 2026-05-19)

Done. Commit with:
  git add data/daily_state/ && git commit -m 'chore: seed initial daily state artifacts'
```

**Verify before committing:** Open each generated file and confirm `data_through_date` matches the date in the filename. If they don't match, there's a data quality issue — do not commit until understood.

- [ ] **Step 3: Commit scripts and artifacts**

```bash
git add scripts/bootstrap_daily_states.py data/daily_state/
git commit -m "feat: add bootstrap_daily_states.py and seed initial daily state artifacts"
```

---

### Task 4: Backend schemas

**Files:**
- Modify: `src/api/schemas.py`
- Modify: `tests/test_daily_state.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_daily_state.py`:

```python
def test_daily_diff_response_schema_is_valid():
    """Pydantic schema accepts a well-formed diff response."""
    from src.api.schemas import DailyDiffResponse

    payload = {
        "current": {
            "as_of_date": "2026-05-21", "generated_at": "2026-05-21T22:00:00+00:00",
            "data_through_date": "2026-05-21", "regime": "elevated",
            "transition_risk": 0.20, "prob_calm": 0.30, "prob_elevated": 0.65,
            "prob_turbulent": 0.05, "vix_level": 18.0, "trend": "uptrend",
            "top_drivers": [{"feature": "vix_chg_5d", "plain_label": "VIX 5-day change", "importance": 0.03}],
            "model_version": {"transition_model": "xgb_transition", "transition_trained_as_of": "2026-04-24",
                               "regime_model": "xgb_regime", "regime_trained_as_of": "2026-04-24"},
        },
        "previous": {
            "as_of_date": "2026-05-20", "generated_at": "2026-05-20T22:00:00+00:00",
            "data_through_date": "2026-05-20", "regime": "calm",
            "transition_risk": 0.10, "prob_calm": 0.80, "prob_elevated": 0.18,
            "prob_turbulent": 0.02, "vix_level": 15.0, "trend": "uptrend",
            "top_drivers": [{"feature": "vix_pct_504d", "plain_label": "VIX relative to 2-year history", "importance": 0.04}],
            "model_version": {"transition_model": "xgb_transition", "transition_trained_as_of": "2026-04-24",
                               "regime_model": "xgb_regime", "regime_trained_as_of": "2026-04-24"},
        },
        "diff": {
            "regime_changed": True, "prior_regime": "calm",
            "risk_delta": 0.10, "vix_delta": 3.0,
            "trend_changed": False, "prior_trend": None,
            "top_driver_changed": True,
            "prior_top_driver": {"feature": "vix_pct_504d", "plain_label": "VIX relative to 2-year history"},
            "current_top_driver": {"feature": "vix_chg_5d", "plain_label": "VIX 5-day change"},
        },
        "metadata": {"current_date": "2026-05-21", "previous_date": "2026-05-20", "gap_days": 1, "is_stale": False},
    }
    obj = DailyDiffResponse(**payload)
    assert obj.diff.regime_changed is True
    assert obj.metadata.gap_days == 1
    assert obj.diff.prior_top_driver.feature == "vix_pct_504d"
    assert obj.diff.current_top_driver.plain_label == "VIX 5-day change"
```

- [ ] **Step 2: Run test to see it fail**

```bash
pytest tests/test_daily_state.py::test_daily_diff_response_schema_is_valid -v
```

Expected: `ImportError` — schemas don't exist yet.

- [ ] **Step 3: Append schemas to `src/api/schemas.py`**

Add to the bottom of the file:

```python
class DailyDriverEntry(BaseModel):
    feature: str
    plain_label: str
    importance: float


class DailyModelVersion(BaseModel):
    transition_model: str
    transition_trained_as_of: str
    regime_model: str
    regime_trained_as_of: str


class DailyStateSnapshot(BaseModel):
    as_of_date: str
    generated_at: str
    data_through_date: str
    regime: str
    transition_risk: float
    prob_calm: float | None
    prob_elevated: float | None
    prob_turbulent: float | None
    vix_level: float | None
    trend: str
    top_drivers: list[DailyDriverEntry]
    model_version: DailyModelVersion


class DailyTopDriverRef(BaseModel):
    feature: str
    plain_label: str


class DailyDiff(BaseModel):
    regime_changed: bool
    prior_regime: str | None
    risk_delta: float
    vix_delta: float | None
    trend_changed: bool
    prior_trend: str | None
    top_driver_changed: bool
    prior_top_driver: DailyTopDriverRef | None
    current_top_driver: DailyTopDriverRef | None


class DailyDiffMetadata(BaseModel):
    current_date: str
    previous_date: str
    gap_days: int
    is_stale: bool


class DailyDiffResponse(BaseModel):
    current: DailyStateSnapshot
    previous: DailyStateSnapshot
    diff: DailyDiff
    metadata: DailyDiffMetadata
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_daily_state.py::test_daily_diff_response_schema_is_valid -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/schemas.py tests/test_daily_state.py
git commit -m "feat: add DailyDiffResponse schema family"
```

---

### Task 5: `GET /daily-diff` endpoint + unit tests

**Files:**
- Modify: `src/api/routes.py`
- Modify: `tests/test_daily_state.py`
- Modify: `tests/test_api_smoke.py`

- [ ] **Step 1: Write unit tests for `_compute_daily_diff`**

Add to `tests/test_daily_state.py`:

```python
def _write_snap(directory: Path, date_str: str, regime: str, risk: float,
                vix: float, top_feature: str = "vix_chg_5d") -> None:
    snap = {
        "as_of_date": date_str, "generated_at": f"{date_str}T22:00:00+00:00",
        "data_through_date": date_str, "regime": regime,
        "transition_risk": risk, "prob_calm": 0.80, "prob_elevated": 0.18,
        "prob_turbulent": 0.02, "vix_level": vix, "trend": "uptrend",
        "top_drivers": [{"feature": top_feature, "plain_label": "VIX 5-day change", "importance": 0.03}],
        "model_version": {"transition_model": "xgb_transition", "transition_trained_as_of": "2026-04-24",
                           "regime_model": "xgb_regime", "regime_trained_as_of": "2026-04-24"},
    }
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{date_str}.json").write_text(json.dumps(snap))


def test_compute_daily_diff_returns_none_no_dir(tmp_path):
    from src.api.routes import _compute_daily_diff
    assert _compute_daily_diff(tmp_path / "nonexistent") is None


def test_compute_daily_diff_returns_none_one_artifact(tmp_path):
    from src.api.routes import _compute_daily_diff
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-21", "calm", 0.10, 15.0)
    assert _compute_daily_diff(d) is None


def test_compute_daily_diff_regime_change(tmp_path):
    from src.api.routes import _compute_daily_diff
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-20", "calm", 0.10, 15.0, top_feature="vix_pct_504d")
    _write_snap(d, "2026-05-21", "elevated", 0.20, 18.0, top_feature="vix_chg_5d")
    result = _compute_daily_diff(d)
    assert result is not None
    assert result["diff"]["regime_changed"] is True
    assert result["diff"]["prior_regime"] == "calm"
    assert abs(result["diff"]["risk_delta"] - 0.10) < 0.001
    assert abs(result["diff"]["vix_delta"] - 3.0) < 0.01
    assert result["diff"]["top_driver_changed"] is True
    assert result["diff"]["prior_top_driver"]["feature"] == "vix_pct_504d"
    assert result["diff"]["current_top_driver"]["feature"] == "vix_chg_5d"
    assert result["metadata"]["gap_days"] == 1
    assert result["metadata"]["is_stale"] is False


def test_compute_daily_diff_no_change(tmp_path):
    from src.api.routes import _compute_daily_diff
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-20", "calm", 0.10, 15.0)
    _write_snap(d, "2026-05-21", "calm", 0.10, 15.0)
    result = _compute_daily_diff(d)
    assert result["diff"]["regime_changed"] is False
    assert result["diff"]["prior_regime"] is None
    assert result["diff"]["top_driver_changed"] is False
    assert result["diff"]["prior_top_driver"] is None
    assert result["diff"]["current_top_driver"] is None


def test_compute_daily_diff_is_stale(tmp_path):
    from src.api.routes import _compute_daily_diff
    d = tmp_path / "daily_state"
    _write_snap(d, "2026-05-10", "calm", 0.10, 15.0)
    _write_snap(d, "2026-05-20", "calm", 0.11, 15.5)
    result = _compute_daily_diff(d)
    assert result["metadata"]["gap_days"] == 10
    assert result["metadata"]["is_stale"] is True
```

- [ ] **Step 2: Run unit tests to see them fail**

```bash
pytest tests/test_daily_state.py -k "compute_daily_diff" -v
```

Expected: `ImportError` — `_compute_daily_diff` doesn't exist yet.

- [ ] **Step 3: Add imports and `_compute_daily_diff` to `src/api/routes.py`**

At the top of `routes.py`, add two module-level imports (after the existing `import math` line):

```python
import json
from pathlib import Path
```

Add `DailyDiffResponse` to the existing schema import block:

```python
from src.api.schemas import (
    HealthResponse, CurrentStateResponse, HistoricalStateResponse,
    EventReplayResponse, ModelDriversResponse, DriverItem,
    HistoricalPoint, EventReplayPoint, TransitionRiskResponse, TransitionRiskPoint,
    StateDelta, ScenarioRequest, ScenarioResponse, DriverDelta,
    ReliabilityResponse, DailyDiffResponse,
)
```

After the `FEATURE_PLAIN_LABELS` dict (around line 280), add:

```python
def _compute_daily_diff(daily_state_dir: Path) -> dict | None:
    """Return diff response dict, or None if fewer than 2 artifacts exist."""
    if not daily_state_dir.exists():
        return None
    files = sorted(daily_state_dir.glob("*.json"))
    if len(files) < 2:
        return None

    current_data = json.loads(files[-1].read_text())
    previous_data = json.loads(files[-2].read_text())

    current_date = date.fromisoformat(current_data["as_of_date"])
    previous_date = date.fromisoformat(previous_data["as_of_date"])
    gap_days = (current_date - previous_date).days

    cur_vix = current_data.get("vix_level")
    prev_vix = previous_data.get("vix_level")
    vix_delta = round(cur_vix - prev_vix, 2) if (cur_vix is not None and prev_vix is not None) else None

    cur_top = current_data["top_drivers"][0] if current_data["top_drivers"] else None
    prev_top = previous_data["top_drivers"][0] if previous_data["top_drivers"] else None
    top_driver_changed = ((cur_top is None) != (prev_top is None)) or (
        cur_top is not None and prev_top is not None and cur_top["feature"] != prev_top["feature"]
    )

    regime_changed = current_data["regime"] != previous_data["regime"]
    trend_changed = current_data["trend"] != previous_data["trend"]

    return {
        "current": current_data,
        "previous": previous_data,
        "diff": {
            "regime_changed": regime_changed,
            "prior_regime": previous_data["regime"] if regime_changed else None,
            "risk_delta": round(current_data["transition_risk"] - previous_data["transition_risk"], 4),
            "vix_delta": vix_delta,
            "trend_changed": trend_changed,
            "prior_trend": previous_data["trend"] if trend_changed else None,
            "top_driver_changed": top_driver_changed,
            "prior_top_driver": {"feature": prev_top["feature"], "plain_label": prev_top["plain_label"]}
                                 if (prev_top and top_driver_changed) else None,
            "current_top_driver": {"feature": cur_top["feature"], "plain_label": cur_top["plain_label"]}
                                   if (cur_top and top_driver_changed) else None,
        },
        "metadata": {
            "current_date": str(current_date),
            "previous_date": str(previous_date),
            "gap_days": gap_days,
            "is_stale": gap_days > 5,
        },
    }
```

- [ ] **Step 4: Run unit tests to verify they pass**

```bash
pytest tests/test_daily_state.py -k "compute_daily_diff" -v
```

Expected: all 5 PASS.

- [ ] **Step 5: Add the endpoint to `src/api/routes.py`**

Immediately after `_compute_daily_diff`, add:

```python
_daily_diff_cache: dict | None = None


@router.get("/daily-diff", response_model=DailyDiffResponse)
async def daily_diff():
    global _daily_diff_cache
    if _daily_diff_cache is not None:
        return _daily_diff_cache
    from src.utils.paths import get_project_root
    result = _compute_daily_diff(get_project_root() / "data" / "daily_state")
    if result is None:
        raise HTTPException(status_code=404, detail="not enough daily snapshots to compute diff")
    _daily_diff_cache = result
    return result
```

- [ ] **Step 6: Write smoke test for the endpoint**

Add to `tests/test_api_smoke.py`:

```python
class TestDailyDiffEndpoint:
    def test_daily_diff_200_with_injected_cache(self, app_with_state):
        import src.api.routes as routes_mod
        prebuilt = {
            "current": {
                "as_of_date": "2026-05-21", "generated_at": "2026-05-21T22:00:00+00:00",
                "data_through_date": "2026-05-21", "regime": "elevated",
                "transition_risk": 0.20, "prob_calm": 0.30, "prob_elevated": 0.65,
                "prob_turbulent": 0.05, "vix_level": 18.0, "trend": "uptrend",
                "top_drivers": [{"feature": "vix_chg_5d", "plain_label": "VIX 5-day change", "importance": 0.03}],
                "model_version": {"transition_model": "xgb_transition", "transition_trained_as_of": "2026-04-24",
                                   "regime_model": "xgb_regime", "regime_trained_as_of": "2026-04-24"},
            },
            "previous": {
                "as_of_date": "2026-05-20", "generated_at": "2026-05-20T22:00:00+00:00",
                "data_through_date": "2026-05-20", "regime": "calm",
                "transition_risk": 0.10, "prob_calm": 0.80, "prob_elevated": 0.18,
                "prob_turbulent": 0.02, "vix_level": 15.0, "trend": "uptrend",
                "top_drivers": [{"feature": "vix_pct_504d", "plain_label": "VIX relative to 2-year history", "importance": 0.04}],
                "model_version": {"transition_model": "xgb_transition", "transition_trained_as_of": "2026-04-24",
                                   "regime_model": "xgb_regime", "regime_trained_as_of": "2026-04-24"},
            },
            "diff": {
                "regime_changed": True, "prior_regime": "calm",
                "risk_delta": 0.10, "vix_delta": 3.0,
                "trend_changed": False, "prior_trend": None,
                "top_driver_changed": True,
                "prior_top_driver": {"feature": "vix_pct_504d", "plain_label": "VIX relative to 2-year history"},
                "current_top_driver": {"feature": "vix_chg_5d", "plain_label": "VIX 5-day change"},
            },
            "metadata": {"current_date": "2026-05-21", "previous_date": "2026-05-20",
                          "gap_days": 1, "is_stale": False},
        }
        routes_mod._daily_diff_cache = prebuilt
        app, _ = app_with_state
        client = TestClient(app)
        resp = client.get("/daily-diff")
        assert resp.status_code == 200
        data = resp.json()
        assert data["metadata"]["gap_days"] == 1
        assert data["diff"]["regime_changed"] is True
        routes_mod._daily_diff_cache = None
```

The 404 path is covered by `test_compute_daily_diff_returns_none_*` unit tests, which test `_compute_daily_diff` directly.

- [ ] **Step 7: Run full test suite**

```bash
pytest -v
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/api/routes.py tests/test_daily_state.py tests/test_api_smoke.py
git commit -m "feat: add GET /daily-diff endpoint with _compute_daily_diff helper and tests"
```

---

### Task 6: Update nightly cron

**Files:**
- Modify: `.github/workflows/update-snapshots.yml`

- [ ] **Step 1: Replace the commit step in `update-snapshots.yml`**

Find the existing `Commit updated snapshots` step:

```yaml
      - name: Commit updated snapshots
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/snapshots/
          git diff --staged --quiet || git commit -m "chore: update snapshots to $(date -u +%Y-%m-%d)"
          git push
```

Replace it with these two steps:

```yaml
      - name: Save daily state artifact
        env:
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
        run: python scripts/save_daily_state.py

      - name: Commit updated snapshots and daily state
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/snapshots/ data/daily_state/
          git diff --staged --quiet || git commit -m "chore: update snapshots to $(date -u +%Y-%m-%d)"
          git push
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/update-snapshots.yml
git commit -m "feat: extend nightly cron to write daily state artifact after snapshot refresh"
```

---

### Task 7: Frontend types, client, and hook

**Files:**
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/hooks/useDailyDiff.ts`

- [ ] **Step 1: Append daily diff types to `frontend/src/types/api.ts`**

Add to the bottom of the file:

```typescript
export interface DailyDriverEntry {
  feature: string
  plain_label: string
  importance: number
}

export interface DailyModelVersion {
  transition_model: string
  transition_trained_as_of: string
  regime_model: string
  regime_trained_as_of: string
}

export interface DailyStateSnapshot {
  as_of_date: string
  generated_at: string
  data_through_date: string
  regime: string
  transition_risk: number
  prob_calm: number | null
  prob_elevated: number | null
  prob_turbulent: number | null
  vix_level: number | null
  trend: string
  top_drivers: DailyDriverEntry[]
  model_version: DailyModelVersion
}

export interface DailyTopDriverRef {
  feature: string
  plain_label: string
}

export interface DailyDiff {
  regime_changed: boolean
  prior_regime: string | null
  risk_delta: number
  vix_delta: number | null
  trend_changed: boolean
  prior_trend: string | null
  top_driver_changed: boolean
  prior_top_driver: DailyTopDriverRef | null
  current_top_driver: DailyTopDriverRef | null
}

export interface DailyDiffMetadata {
  current_date: string
  previous_date: string
  gap_days: number
  is_stale: boolean
}

export interface DailyDiffResponse {
  current: DailyStateSnapshot
  previous: DailyStateSnapshot
  diff: DailyDiff
  metadata: DailyDiffMetadata
}
```

- [ ] **Step 2: Add `dailyDiff()` to `frontend/src/api/client.ts`**

Update the import at the top:

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
} from '../types/api'
```

Add to the `api` export object (after `reliability`):

```typescript
  dailyDiff: () => get<DailyDiffResponse>('/daily-diff'),
```

- [ ] **Step 3: Create `frontend/src/hooks/useDailyDiff.ts`**

```typescript
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { DailyDiffResponse } from '../types/api'

export function useDailyDiff() {
  const [data, setData] = useState<DailyDiffResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.dailyDiff()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  return { data, loading }
}
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/api/client.ts frontend/src/hooks/useDailyDiff.ts
git commit -m "feat: add daily diff types, API client method, and useDailyDiff hook"
```

---

### Task 8: Frontend `DailyDiffBlock` on Current State

**Files:**
- Modify: `frontend/src/pages/CurrentState.tsx`

- [ ] **Step 1: Add imports**

At the top of `CurrentState.tsx`, add after the existing hook imports:

```typescript
import { useDailyDiff } from '../hooks/useDailyDiff'
```

Update the type import line (currently `import type { StateDelta } from '../types/api'`) to:

```typescript
import type { StateDelta, DailyDiffResponse } from '../types/api'
```

- [ ] **Step 2: Add the hook call**

Inside the `CurrentState` function, add after `const { data: reliabilityTable } = useReliability()`:

```typescript
const { data: dailyDiff } = useDailyDiff()
```

- [ ] **Step 3: Place the block in the JSX**

Find `<div className="h-px" style={{ background: '#151d2e' }} />` in the return statement. Insert immediately before it:

```tsx
{dailyDiff && (
  <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
    <DailyDiffBlock diff={dailyDiff} />
  </motion.div>
)}
```

- [ ] **Step 4: Add `DailyDiffBlock` component**

Add after the closing brace of `GaugeArc`, at the bottom of the file:

```typescript
function DailyDiffBlock({ diff: response }: { diff: DailyDiffResponse }) {
  const { diff, metadata } = response

  const prevDate = new Date(metadata.previous_date + 'T12:00:00Z')
  const prevFormatted = prevDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const label = metadata.gap_days === 1
    ? `Since last trading day (${prevDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${prevFormatted})`
    : `Compared with snapshot as of ${prevFormatted}`

  const rows: { icon: string; text: string; positive: boolean }[] = []

  if (diff.regime_changed && diff.prior_regime) {
    rows.push({ icon: '🔄', text: `Regime shifted from ${diff.prior_regime} → ${response.current.regime}`, positive: false })
  }

  if (Math.abs(diff.risk_delta) >= 0.01) {
    const up = diff.risk_delta > 0
    rows.push({ icon: up ? '📈' : '📉', text: `Transition risk ${up ? '+' : ''}${(diff.risk_delta * 100).toFixed(1)}pp`, positive: !up })
  }

  if (diff.vix_delta !== null && Math.abs(diff.vix_delta) >= 0.5) {
    const up = diff.vix_delta > 0
    rows.push({ icon: up ? '↑' : '↓', text: `VIX ${up ? '+' : ''}${diff.vix_delta.toFixed(1)}`, positive: !up })
  }

  if (diff.top_driver_changed && diff.prior_top_driver && diff.current_top_driver) {
    rows.push({ icon: '⇄', text: `Top risk driver: ${diff.prior_top_driver.plain_label} → ${diff.current_top_driver.plain_label}`, positive: false })
  }

  return (
    <div className="rounded-lg px-4 py-3" style={{ background: '#080d18', border: '1px solid #151d2e' }}>
      <div className="text-[9px] font-bold tracking-widest uppercase mb-2" style={{ color: '#4a6080' }}>
        {label}
      </div>

      {metadata.is_stale && (
        <p className="text-[9px] mb-2" style={{ color: '#92400e' }}>
          Snapshot is unusually old — comparison may not reflect recent conditions
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-[11px]" style={{ color: '#64748b' }}>
          No notable market-state change since the last snapshot.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span>{row.icon}</span>
              <span style={{ color: row.positive ? '#4ade80' : '#94a3b8', flex: 1 }}>{row.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Typecheck and build**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Expected: no errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CurrentState.tsx
git commit -m "feat: add DailyDiffBlock to Current State page"
```

---

### Task 9: End-to-end verification

- [ ] **Step 1: Full test suite**

```bash
pytest -v
```

Expected: all tests pass.

- [ ] **Step 2: Verify the API endpoint with bootstrapped artifacts**

```bash
uvicorn src.api.main:app --reload --port 8001 &
curl http://localhost:8001/daily-diff | python -m json.tool | head -50
```

Verify:
- Returns 200 with `current`, `previous`, `diff`, `metadata`
- `metadata.gap_days` is 1 (consecutive trading day artifacts)
- `metadata.is_stale` is `false`
- `current.data_through_date` matches the most recent artifact filename date

- [ ] **Step 3: Verify the UI**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`. On Current State:
- "Since yesterday" block appears between the transition-risk row and the horizontal divider
- Label reads e.g. "Since last trading day (Mon May 19)" — not a hardcoded "Yesterday"
- Rows show only for changes that meet thresholds (risk ≥ 0.01, VIX ≥ 0.5)
- If both bootstrap artifacts are identical: "No notable market-state change since the last snapshot."
- No console errors in browser DevTools

- [ ] **Step 4: Verify row suppression**

Temporarily edit the two bootstrapped artifacts: set one `transition_risk = 0.105` and the other `0.10` (delta = 0.005, below threshold). Restart backend. Confirm risk row is hidden. Restore original values.

- [ ] **Step 5: Push and verify CI**

```bash
git push origin main
```

Both `Backend tests` and `Frontend build` CI jobs should be green.

---

## Self-Review Checklist (completed by plan author)

- **Spec coverage:** artifact (§1) ✓, cron (§1) ✓, bootstrap (§3) ✓, API (§2) ✓, schemas ✓, frontend types/hook/block (§3) ✓, verification (§5) ✓
- **No placeholders:** all code blocks complete, all commands include expected output
- **Type consistency:** `DailyDiffResponse`, `DailyStateSnapshot`, `DailyTopDriverRef`, `DailyDiff`, `DailyDiffMetadata` consistent across Python schemas, TypeScript interfaces, and usage in `DailyDiffBlock` and `_compute_daily_diff`
- **`top_driver_changed` logic:** when both artifacts have the same top feature, `top_driver_changed = False` and both `prior_top_driver`/`current_top_driver` are `null` — tested in `test_compute_daily_diff_no_change`
- **Bootstrap anti-relabeling:** date comes from `panel.index[-1].date()`, not from CLI; sanity check prints warning if commit date differs
- **Cache reset in tests:** `routes_mod._daily_diff_cache = None` called before and after every smoke test that touches it
