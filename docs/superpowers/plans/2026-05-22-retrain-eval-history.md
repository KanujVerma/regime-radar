# Retrain + Reliability Rebuild + Eval History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/retrain.py` and `src/evaluation/eval_history.py` so that each retrain run overwrites model artifacts in place, rebuilds the OOF reliability table, and appends a pre/post metrics snapshot to `data/models/eval_history/YYYY-MM-DD.json`.

**Architecture:** `eval_history.py` is a pure read/write module with no side effects. `bootstrap_data.py` is refactored to expose `run_pipeline()` that returns training summaries — `retrain.py` calls it as a single function, making `retrain.py` a thin orchestrator (pre-snapshot → dry-run gate → `run_pipeline()` → reliability rebuild → eval history write → summary print). No training logic is duplicated.

**Tech Stack:** Python 3.11+, XGBoost, pandas, joblib, pytest, subprocess (for smoke test)

---

## Partial-Overwrite Risk (explicit, accepted for Sub-project A)

`train_regime_model()` and `train_transition_model()` both call `save_artifact()` immediately on completion. If `train_transition_model()` fails after regime training has already written `xgb_regime`, the artifacts are in a partial state: `xgb_regime` is new, `xgb_transition` / `xgb_transition_calibrator` / `oof_predictions` are old. There is no rollback. The eval history entry (step 10 in retrain.py) is written only after all training and reliability steps succeed — so Sub-project B will never see a corrupt history record. But the model artifacts themselves may be mismatched after a mid-run failure. This is accepted risk for Sub-project A; rollback safety is Sub-project B/C scope.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/evaluation/eval_history.py` | **Create** | Read/write eval history entries only |
| `scripts/bootstrap_data.py` | **Modify** | Extract `run_pipeline()` returning training summaries; keep `main()` as thin wrapper |
| `scripts/retrain.py` | **Create** | Thin orchestrator: pre-snapshot → dry-run gate → `run_pipeline()` → reliability → eval history |
| `data/models/eval_history/.gitkeep` | **Create** | Track directory in git |
| `tests/test_eval_history.py` | **Create** | 5 unit tests for eval_history module |
| `tests/test_retrain_smoke.py` | **Create** | 1 dry-run smoke test |

---

## Task 1: eval_history module (TDD)

**Files:**
- Create: `src/evaluation/eval_history.py`
- Create: `tests/test_eval_history.py`

### Step 1.1: Write all 5 failing tests

- [ ] **Create `tests/test_eval_history.py`**

```python
"""Unit tests for src/evaluation/eval_history.py"""
from __future__ import annotations
import json
import re
import pytest
from pathlib import Path
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Test 1: read_pre_retrain_snapshot extracts expected fields
# ---------------------------------------------------------------------------
def test_read_pre_retrain_snapshot_extracts_expected_fields():
    """Snapshot contains transition.mean_roc_auc, regime.mean_macro_f1,
    reliability.max_evaluated_p when all artifacts are present."""
    trans_meta = {
        "mean_roc_auc": 0.82, "mean_pr_auc": 0.35,
        "brier_calibrated": 0.07, "ece_calibrated": 0.02, "n_folds": 18,
    }
    regime_meta = {"mean_macro_f1": 0.78}
    reliability = {"max_evaluated_p": 0.30, "base_rate": 0.0914, "source": "oof"}

    with patch("src.evaluation.eval_history.load_metadata") as mock_meta, \
         patch("src.evaluation.eval_history._load_reliability") as mock_rel:
        mock_meta.side_effect = lambda name: (
            trans_meta if name == "xgb_transition" else regime_meta
        )
        mock_rel.return_value = reliability

        from src.evaluation.eval_history import read_pre_retrain_snapshot
        snapshot = read_pre_retrain_snapshot(git_commit="abc1234")

    assert snapshot["transition"]["mean_roc_auc"] == 0.82
    assert snapshot["regime"]["mean_macro_f1"] == 0.78
    assert snapshot["reliability"]["max_evaluated_p"] == 0.30
    assert snapshot["git_commit"] == "abc1234"


# ---------------------------------------------------------------------------
# Test 2: write_eval_history_entry creates valid JSON with all top-level fields
# ---------------------------------------------------------------------------
def test_write_eval_history_creates_valid_json(tmp_path):
    """Written file must be valid JSON with all required top-level keys."""
    from src.evaluation.eval_history import write_eval_history_entry

    pre = {
        "transition": {"mean_roc_auc": 0.82, "mean_pr_auc": 0.35,
                       "brier_calibrated": 0.07, "ece_calibrated": 0.02, "n_folds": 18},
        "regime": {"mean_macro_f1": 0.78},
        "reliability": {"max_evaluated_p": 0.30, "base_rate": 0.0914, "source": "oof"},
        "git_commit": "abc1234",
    }
    post = {
        "transition": {"mean_roc_auc": 0.83, "mean_pr_auc": 0.36,
                       "brier_calibrated": 0.068, "ece_calibrated": 0.019,
                       "n_folds": 18, "n_training_rows": 7832},
        "regime": {"mean_macro_f1": 0.79},
        "reliability": {"max_evaluated_p": 0.35, "base_rate": 0.0918, "source": "oof"},
    }

    with patch("src.evaluation.eval_history.EVAL_HISTORY_DIR", tmp_path):
        path = write_eval_history_entry(
            pre=pre,
            post=post,
            training_data_end_date="2026-05-21",
            oof_eval_window={"start": "1995-04-07", "end": "2026-05-21"},
            git_commit="abc1234",
        )

    assert path.exists()
    entry = json.loads(path.read_text())
    for key in ("retrain_date", "timestamp", "git_commit",
                "training_data_end_date", "oof_eval_window",
                "previous_model", "new_model"):
        assert key in entry, f"Missing required key: {key}"


# ---------------------------------------------------------------------------
# Test 3: write_eval_history_entry uses YYYY-MM-DD.json filename
# ---------------------------------------------------------------------------
def test_write_eval_history_uses_date_filename(tmp_path):
    """File must be named YYYY-MM-DD.json matching retrain_date."""
    from src.evaluation.eval_history import write_eval_history_entry

    pre = {"transition": {}, "regime": {}, "reliability": {}, "git_commit": None}
    post = {"transition": {"n_training_rows": 100}, "regime": {}, "reliability": {}}

    with patch("src.evaluation.eval_history.EVAL_HISTORY_DIR", tmp_path):
        path = write_eval_history_entry(
            pre=pre, post=post,
            training_data_end_date="2026-05-21",
            oof_eval_window={"start": "1995-04-07", "end": "2026-05-21"},
            git_commit=None,
        )

    assert re.match(r"\d{4}-\d{2}-\d{2}\.json", path.name), (
        f"Expected YYYY-MM-DD.json, got {path.name}"
    )


# ---------------------------------------------------------------------------
# Test 4: write_eval_history_entry creates missing directory
# ---------------------------------------------------------------------------
def test_write_eval_history_creates_missing_directory(tmp_path):
    """Directory is created automatically (parents=True, exist_ok=True)."""
    from src.evaluation.eval_history import write_eval_history_entry

    deep_dir = tmp_path / "nested" / "eval_history"
    assert not deep_dir.exists()

    pre = {"transition": {}, "regime": {}, "reliability": {}, "git_commit": None}
    post = {"transition": {"n_training_rows": 50}, "regime": {}, "reliability": {}}

    with patch("src.evaluation.eval_history.EVAL_HISTORY_DIR", deep_dir):
        path = write_eval_history_entry(
            pre=pre, post=post,
            training_data_end_date="2026-05-21",
            oof_eval_window={"start": "1995-04-07", "end": "2026-05-21"},
            git_commit=None,
        )

    assert deep_dir.exists()
    assert path.exists()


# ---------------------------------------------------------------------------
# Test 5: load_recent_entries raises ValueError on malformed JSON
# ---------------------------------------------------------------------------
def test_load_recent_entries_raises_on_malformed_json(tmp_path):
    """load_recent_entries must raise ValueError (not silently skip) on bad JSON."""
    from src.evaluation.eval_history import load_recent_entries

    valid = tmp_path / "2026-05-20.json"
    valid.write_text(json.dumps({"retrain_date": "2026-05-20"}))

    bad = tmp_path / "2026-05-21.json"
    bad.write_text("{not valid json")

    with patch("src.evaluation.eval_history.EVAL_HISTORY_DIR", tmp_path):
        with pytest.raises(ValueError, match="malformed"):
            load_recent_entries(n=2)
```

- [ ] **Run to confirm all 5 tests fail (ImportError expected)**

```bash
cd /Users/kanuj/regime-radar && python3 -m pytest tests/test_eval_history.py -v 2>&1 | head -30
```

Expected: 5 errors — `eval_history` does not exist yet.

### Step 1.2: Implement `src/evaluation/eval_history.py`

- [ ] **Create `src/evaluation/eval_history.py`**

```python
"""Read and write per-retrain eval history entries.

Sub-project B imports this module directly to gate on AUC/ECE regression.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path

from src.models.registry import load_metadata
from src.utils.paths import MODELS_DIR

EVAL_HISTORY_DIR: Path = MODELS_DIR / "eval_history"
_RELIABILITY_PATH: Path = (
    Path(__file__).resolve().parents[2] / "data" / "reliability" / "transition_reliability.json"
)


def _load_reliability() -> dict:
    if not _RELIABILITY_PATH.exists():
        return {}
    return json.loads(_RELIABILITY_PATH.read_text())


def read_pre_retrain_snapshot(git_commit: str | None = None) -> dict:
    """Load current artifact meta.json files and reliability table.

    Missing keys are omitted (not raised) — handles older artifacts.
    Returns empty sub-dicts if an artifact file does not exist.
    """
    def _safe_load(name: str) -> dict:
        try:
            return load_metadata(name)
        except FileNotFoundError:
            return {}

    trans = _safe_load("xgb_transition")
    regime = _safe_load("xgb_regime")
    reliability = _load_reliability()

    return {
        "transition": {
            k: trans[k]
            for k in ("mean_roc_auc", "mean_pr_auc", "brier_calibrated",
                      "ece_calibrated", "n_folds")
            if k in trans
        },
        "regime": {
            k: regime[k]
            for k in ("mean_macro_f1",)
            if k in regime
        },
        "reliability": {
            k: reliability[k]
            for k in ("max_evaluated_p", "base_rate", "source")
            if k in reliability
        },
        "git_commit": git_commit,
    }


def build_post_retrain_snapshot(
    trans_summary: dict,
    regime_summary: dict,
    reliability_table: dict,
    n_training_rows: int,
) -> dict:
    """Construct post-training metrics dict from training return values.

    Note: oof_eval_window is a top-level entry field — pass it directly
    to write_eval_history_entry, not here.
    """
    return {
        "transition": {
            k: trans_summary[k]
            for k in ("mean_roc_auc", "mean_pr_auc", "brier_calibrated",
                      "ece_calibrated", "n_folds")
            if k in trans_summary
        } | {"n_training_rows": n_training_rows},
        "regime": {
            k: regime_summary[k]
            for k in ("mean_macro_f1",)
            if k in regime_summary
        },
        "reliability": {
            k: reliability_table[k]
            for k in ("max_evaluated_p", "base_rate", "source")
            if k in reliability_table
        },
    }


def write_eval_history_entry(
    pre: dict,
    post: dict,
    training_data_end_date: str,
    oof_eval_window: dict,
    git_commit: str | None,
) -> Path:
    """Write data/models/eval_history/YYYY-MM-DD.json.

    Raises FileExistsError if a file already exists for today's date.
    Returns the path written.
    """
    EVAL_HISTORY_DIR.mkdir(parents=True, exist_ok=True)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path = EVAL_HISTORY_DIR / f"{today}.json"

    if path.exists():
        raise FileExistsError(
            f"Eval history entry already exists for {today}: {path}. "
            "Delete or rename it before running retrain again today."
        )

    entry = {
        "retrain_date": today,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "git_commit": git_commit,
        "training_data_end_date": training_data_end_date,
        "oof_eval_window": oof_eval_window,
        "previous_model": {
            "transition": pre.get("transition", {}),
            "regime": pre.get("regime", {}),
            "reliability": pre.get("reliability", {}),
        },
        "new_model": {
            "transition": post.get("transition", {}),
            "regime": post.get("regime", {}),
            "reliability": post.get("reliability", {}),
        },
    }

    path.write_text(json.dumps(entry, indent=2))
    return path


def load_recent_entries(n: int = 2) -> list[dict]:
    """Load the last N eval history entries sorted newest-first.

    Raises ValueError on any malformed (non-parseable) JSON file within
    the most recent N entries. Does not silently skip bad files.
    Returns an empty list if the directory does not exist or is empty.
    """
    if not EVAL_HISTORY_DIR.exists():
        return []

    files = sorted(EVAL_HISTORY_DIR.glob("*.json"), reverse=True)[:n]
    if not files:
        return []

    entries = []
    for f in files:
        try:
            entries.append(json.loads(f.read_text()))
        except json.JSONDecodeError as e:
            raise ValueError(
                f"Eval history entry {f.name} contains malformed JSON: {e}"
            ) from e
    return entries
```

### Step 1.3: Run tests — expect 5 passing

- [ ] **Run the 5 unit tests**

```bash
cd /Users/kanuj/regime-radar && python3 -m pytest tests/test_eval_history.py -v
```

Expected:
```
tests/test_eval_history.py::test_read_pre_retrain_snapshot_extracts_expected_fields PASSED
tests/test_eval_history.py::test_write_eval_history_creates_valid_json PASSED
tests/test_eval_history.py::test_write_eval_history_uses_date_filename PASSED
tests/test_eval_history.py::test_write_eval_history_creates_missing_directory PASSED
tests/test_eval_history.py::test_load_recent_entries_raises_on_malformed_json PASSED
5 passed
```

### Step 1.4: Run full suite — no regressions

- [ ] **Run all tests**

```bash
cd /Users/kanuj/regime-radar && python3 -m pytest --tb=short -q
```

Expected: all 97+ existing tests pass plus 5 new = 102+.

### Step 1.5: Create .gitkeep and commit

- [ ] **Create the gitkeep**

```bash
touch /Users/kanuj/regime-radar/data/models/eval_history/.gitkeep
```

- [ ] **Commit**

```bash
cd /Users/kanuj/regime-radar
git add src/evaluation/eval_history.py tests/test_eval_history.py data/models/eval_history/.gitkeep
git commit -m "feat: add eval_history module with read/write/load functions"
```

---

## Task 2: Refactor `bootstrap_data.py` to expose `run_pipeline()`

`retrain.py` must not duplicate the training pipeline. This task extracts `run_pipeline()` from `bootstrap_data.py`'s `main()`, returning the training summaries `retrain.py` needs. `main()` becomes a thin wrapper.

**Files:**
- Modify: `scripts/bootstrap_data.py`

### Step 2.1: Read the file before editing

- [ ] **Read `scripts/bootstrap_data.py`** to understand the current `main()` body before any edits.

```bash
cat -n /Users/kanuj/regime-radar/scripts/bootstrap_data.py
```

### Step 2.2: Refactor to extract `run_pipeline()`

- [ ] **Replace the contents of `scripts/bootstrap_data.py`** with the refactored version below.

The only behavioral change: `main()` now delegates to `run_pipeline()` and prints the summary values it returns. The pipeline logic itself is identical to before.

```python
"""One-shot bootstrap: fetch data → build features → train models."""
from __future__ import annotations
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.utils.paths import PROCESSED_DIR, FIXTURES_DIR
from src.utils.logging import get_logger

_logger = get_logger("bootstrap")


def run_pipeline() -> dict:
    """Run the full fetch → merge → features → train pipeline.

    Returns:
        trans_summary: dict from train_transition_model()
        regime_summary: dict from train_regime_model()
        n_training_rows: int
        training_data_end_date: str (YYYY-MM-DD, last row of feature matrix)
    """
    from pathlib import Path
    from src.data.fetch_yfinance import fetch_spy_history
    from src.data.fetch_fred import fetch_emv
    from src.data.fetch_vix import fetch_vix_history
    from src.data.merge_sources import merge_market_panel, save_panel
    from src.features.build_market_features import build_features
    from src.labeling.build_regime_labels import build_regime_labels
    from src.labeling.build_transition_labels import build_transition_labels
    from src.labeling.build_trend_labels import build_trend_labels
    from src.models.train_regime_model import train_regime_model
    from src.models.train_transition_model import train_transition_model

    _logger.info("=== Pipeline start ===")

    # 1. Fetch data
    _logger.info("Fetching SPY history from 1993...")
    spy = fetch_spy_history(start="1993-01-01", cache_path=Path(PROCESSED_DIR) / "spy.parquet")

    _logger.info("Fetching VIX from FRED VIXCLS (from 1990)...")
    vix = fetch_vix_history(start="1990-01-01", cache_path=Path(PROCESSED_DIR) / "vix.parquet")

    _logger.info("Fetching EMVOVERALLEMV from FRED...")
    emv = fetch_emv(start="1985-01-01", cache_path=Path(PROCESSED_DIR) / "emv.parquet")

    # 2. Merge
    _logger.info("Merging panel...")
    panel = merge_market_panel(spy, vix, emv)
    save_panel(panel, Path(PROCESSED_DIR) / "panel.parquet")

    # 3. Labels
    _logger.info("Building regime labels...")
    regime = build_regime_labels(panel)

    _logger.info("Building transition labels...")
    transition = build_transition_labels(regime)

    _logger.info("Building trend labels...")
    trend = build_trend_labels(panel)

    # 4. Features
    _logger.info("Building features...")
    features = build_features(panel, regime_series=regime)

    # Align and drop NaN rows
    import pandas as pd
    df = features.copy()
    df["regime"] = regime
    df["transition_up"] = transition
    df["trend"] = trend
    df = df.dropna(subset=list(features.columns) + ["regime", "transition_up"])
    feat_cols = list(features.columns)

    X = df[feat_cols]
    y_regime = df["regime"]
    y_transition = df["transition_up"]
    n_training_rows = len(X)
    training_data_end_date = str(X.index[-1].date())

    _logger.info("Training set: %d rows, %d features, end=%s",
                 n_training_rows, len(feat_cols), training_data_end_date)

    # 5. Train
    # NOTE: each train function calls save_artifact() immediately on completion.
    # If train_transition_model() fails after train_regime_model() has already
    # written xgb_regime, the artifacts will be in a partial state.
    # This is accepted risk for Sub-project A; see plan for details.
    _logger.info("Training regime model...")
    regime_summary = train_regime_model(X, y_regime)
    _logger.info("Regime model: macro_f1=%.3f", regime_summary["mean_macro_f1"])

    _logger.info("Training transition model...")
    trans_summary = train_transition_model(X, y_transition, regime_labels=y_regime)
    _logger.info("Transition model: roc_auc=%.3f pr_auc=%.3f",
                 trans_summary["mean_roc_auc"], trans_summary["mean_pr_auc"])

    _logger.info("=== Pipeline complete ===")

    return {
        "trans_summary": trans_summary,
        "regime_summary": regime_summary,
        "n_training_rows": n_training_rows,
        "training_data_end_date": training_data_end_date,
    }


def main():
    _logger.info("=== RegimeRadar Bootstrap ===")
    result = run_pipeline()
    _logger.info(
        "Bootstrap complete: roc_auc=%.3f pr_auc=%.3f macro_f1=%.3f",
        result["trans_summary"]["mean_roc_auc"],
        result["trans_summary"]["mean_pr_auc"],
        result["regime_summary"]["mean_macro_f1"],
    )


if __name__ == "__main__":
    main()
```

### Step 2.3: Verify `bootstrap_data.py` imports cleanly

- [ ] **Check the refactored file imports without error**

```bash
cd /Users/kanuj/regime-radar && python3 -c "
import sys; sys.path.insert(0, '.')
sys.path.insert(0, 'scripts')
from bootstrap_data import run_pipeline, main
print('bootstrap_data imports OK')
print('run_pipeline signature:', run_pipeline.__doc__.strip().splitlines()[0])
"
```

Expected:
```
bootstrap_data imports OK
run_pipeline signature: Run the full fetch → merge → features → train pipeline.
```

### Step 2.4: Run full suite — no regressions

- [ ] **Run all tests**

```bash
cd /Users/kanuj/regime-radar && python3 -m pytest --tb=short -q
```

Expected: same 102+ tests still pass (no tests directly import bootstrap_data).

### Step 2.5: Commit

- [ ] **Commit**

```bash
cd /Users/kanuj/regime-radar
git add scripts/bootstrap_data.py
git commit -m "refactor: extract run_pipeline() from bootstrap_data.main() for retrain reuse"
```

---

## Task 3: `scripts/retrain.py` as thin orchestrator + dry-run smoke test (TDD)

With `run_pipeline()` available, `retrain.py` needs no training logic of its own.

**Files:**
- Create: `scripts/retrain.py`
- Create: `tests/test_retrain_smoke.py`

### Step 3.1: Write the failing smoke test

- [ ] **Create `tests/test_retrain_smoke.py`**

```python
"""Smoke test for scripts/retrain.py --dry-run.

Verifies:
  - exits with code 0
  - writes no files to data/models/eval_history/
  - stdout contains a recognizable message confirming the pre-snapshot loaded
"""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path


EVAL_HISTORY_DIR = Path(__file__).resolve().parent.parent / "data" / "models" / "eval_history"
RETRAIN_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "retrain.py"


def test_dry_run_exits_cleanly():
    """--dry-run must exit 0, write nothing to eval_history/, and confirm snapshot load."""
    before = set(EVAL_HISTORY_DIR.glob("*.json")) if EVAL_HISTORY_DIR.exists() else set()

    result = subprocess.run(
        [sys.executable, str(RETRAIN_SCRIPT), "--dry-run"],
        capture_output=True,
        text=True,
        cwd=str(RETRAIN_SCRIPT.parent.parent),
    )

    assert result.returncode == 0, (
        f"--dry-run exited with code {result.returncode}\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )

    after = set(EVAL_HISTORY_DIR.glob("*.json")) if EVAL_HISTORY_DIR.exists() else set()
    new_files = after - before
    assert not new_files, (
        f"--dry-run must not write to eval_history/. New files: {new_files}"
    )

    combined = result.stdout + result.stderr
    assert "dry-run" in combined.lower(), (
        f"Expected a 'dry-run' confirmation message in output. Got:\n{combined}"
    )
    assert "pre-retrain" in combined.lower() or "snapshot" in combined.lower(), (
        f"Expected snapshot-loaded confirmation in output. Got:\n{combined}"
    )
```

- [ ] **Run to confirm it fails**

```bash
cd /Users/kanuj/regime-radar && python3 -m pytest tests/test_retrain_smoke.py -v 2>&1 | head -20
```

Expected: FAIL — `retrain.py` does not exist yet.

### Step 3.2: Implement `scripts/retrain.py`

- [ ] **Create `scripts/retrain.py`**

```python
"""Recurring retrain script: fetch → features → train → OOF reliability → eval history.

Usage:
    python3 scripts/retrain.py            # full retrain
    python3 scripts/retrain.py --dry-run  # read pre-retrain snapshot only, exit 0

--dry-run behavior (locked):
    - Executes steps 1-3 only (git commit, pre-retrain snapshot, exit)
    - Reads current artifacts and validates the pre-retrain snapshot
    - Exits with code 0 if snapshot builds successfully
    - Writes nothing: no data fetched, no models trained, no reliability rebuilt,
      no eval history written

Partial-overwrite risk: train_regime_model() and train_transition_model() each call
save_artifact() immediately on completion. A failure between the two leaves artifacts
in a partial state. The eval history entry (step 10) is written only after all steps
succeed, so Sub-project B never sees a corrupt record. Rollback safety is Sub-project B/C scope.
"""
from __future__ import annotations
import argparse
import json
import subprocess
import sys
from pathlib import Path

_project_root = Path(__file__).resolve().parent.parent
_scripts_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(_project_root))
sys.path.insert(0, str(_scripts_dir))

from src.utils.logging import get_logger

_logger = get_logger("retrain")

RELIABILITY_PATH = _project_root / "data" / "reliability" / "transition_reliability.json"


def _get_git_commit() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, check=True,
            cwd=str(_project_root),
        )
        return result.stdout.strip()
    except Exception:
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Retrain RegimeRadar models")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Read pre-retrain snapshot only; exit 0 without mutating anything",
    )
    args = parser.parse_args()

    # Step 1: git commit
    git_commit = _get_git_commit()
    _logger.info("git commit: %s", git_commit)

    # Step 2: read pre-retrain snapshot
    from src.evaluation.eval_history import (
        read_pre_retrain_snapshot,
        build_post_retrain_snapshot,
        write_eval_history_entry,
    )
    pre = read_pre_retrain_snapshot(git_commit=git_commit)
    _logger.info(
        "Pre-retrain snapshot loaded — transition roc_auc=%s  max_evaluated_p=%s",
        pre["transition"].get("mean_roc_auc"),
        pre["reliability"].get("max_evaluated_p"),
    )

    # Step 3: DRY-RUN EXIT — no mutations below this line in dry-run mode
    if args.dry_run:
        _logger.info("--dry-run: exiting cleanly. No data fetched, no artifacts written.")
        sys.exit(0)

    # Steps 4-7: fetch, features, train (all via run_pipeline — canonical path)
    from bootstrap_data import run_pipeline
    pipeline = run_pipeline()
    trans_summary = pipeline["trans_summary"]
    regime_summary = pipeline["regime_summary"]
    n_training_rows = pipeline["n_training_rows"]
    training_data_end_date = pipeline["training_data_end_date"]

    # Step 8: rebuild OOF reliability table
    from build_reliability_table import build_oof_table
    _logger.info("Rebuilding OOF reliability table...")
    reliability_table = build_oof_table()
    RELIABILITY_PATH.parent.mkdir(parents=True, exist_ok=True)
    RELIABILITY_PATH.write_text(json.dumps(reliability_table, indent=2))
    _logger.info(
        "Reliability table written: max_evaluated_p=%s",
        reliability_table.get("max_evaluated_p"),
    )

    # Step 9: build post-retrain snapshot
    from src.models.registry import load_artifact
    oof_df = load_artifact("oof_predictions")
    oof_eval_window = {
        "start": str(oof_df.index.min().date()),
        "end": str(oof_df.index.max().date()),
    }
    post = build_post_retrain_snapshot(
        trans_summary=trans_summary,
        regime_summary=regime_summary,
        reliability_table=reliability_table,
        n_training_rows=n_training_rows,
    )

    # Step 10: write eval history entry (only reached if steps 4-8 all succeeded)
    history_path = write_eval_history_entry(
        pre=pre,
        post=post,
        training_data_end_date=training_data_end_date,
        oof_eval_window=oof_eval_window,
        git_commit=git_commit,
    )
    _logger.info("Eval history written: %s", history_path)

    # Step 11: print summary
    auc_before = pre["transition"].get("mean_roc_auc")
    auc_after = post["transition"].get("mean_roc_auc")
    auc_delta = (
        round(auc_after - auc_before, 4)
        if auc_before is not None and auc_after is not None
        else "n/a"
    )

    print("\n=== Retrain Summary ===")
    print(f"  AUC:             {auc_before} → {auc_after}  (delta: {auc_delta})")
    print(f"  max_evaluated_p: {pre['reliability'].get('max_evaluated_p')} → {reliability_table.get('max_evaluated_p')}")
    print(f"  oof_eval_window.end: {oof_eval_window['end']}")
    print(f"  eval history: {history_path}")
    print("======================")


if __name__ == "__main__":
    main()
```

### Step 3.3: Run smoke test — expect pass

- [ ] **Run the smoke test**

```bash
cd /Users/kanuj/regime-radar && python3 -m pytest tests/test_retrain_smoke.py -v
```

Expected:
```
tests/test_retrain_smoke.py::test_dry_run_exits_cleanly PASSED
1 passed
```

If it fails: check `result.stderr` in the failure message. The dry-run path only calls `read_pre_retrain_snapshot()` — if artifacts don't exist yet, `_safe_load` returns `{}` gracefully and the snapshot still builds.

### Step 3.4: Run full suite — no regressions

- [ ] **Run all tests**

```bash
cd /Users/kanuj/regime-radar && python3 -m pytest --tb=short -q
```

Expected: 103+ tests pass (97+ existing + 5 eval_history + 1 smoke).

### Step 3.5: Commit

- [ ] **Commit**

```bash
cd /Users/kanuj/regime-radar
git add scripts/retrain.py tests/test_retrain_smoke.py
git commit -m "feat: add retrain.py thin orchestrator with --dry-run support"
```

---

## Task 4: Integration verification (OOF gap closure)

Runs `retrain.py` for real and checks all acceptance criteria. **Do not skip** — unit tests do not verify that the OOF window extended or that the reliability table was rebuilt from the new OOF.

**Expected duration:** 10–20 minutes (18 walk-forward folds over ~7,800 rows, live data fetch from yfinance + FRED).

### Step 4.1: Record pre-retrain state

- [ ] **Capture current state before running**

```bash
cd /Users/kanuj/regime-radar && python3 -c "
import json
from pathlib import Path
t = json.loads(Path('data/reliability/transition_reliability.json').read_text())
print('--- transition_reliability.json (PRE) ---')
print('max_evaluated_p:', t['max_evaluated_p'])
print('base_rate:', t['base_rate'])
print('source:', t.get('source', 'MISSING'))
print('total n:', sum(b['n'] for b in t['bins']))
"
```

Record the output. You will compare every value after retrain.

### Step 4.2: Run the full retrain

- [ ] **Run retrain.py**

```bash
cd /Users/kanuj/regime-radar && python3 scripts/retrain.py
```

Watch for:
- "Pipeline start" → "Training regime model..." → "Training transition model..." (longest step)
- "Rebuilding OOF reliability table..."
- "Eval history written: ..."
- Final `=== Retrain Summary ===` block

If the run fails mid-way (e.g., network error), the eval history file will NOT be written — safe to re-run.

### Step 4.3: Verify OOF window extended

- [ ] **Check oof_eval_window.end and oof_predictions max date**

```bash
cd /Users/kanuj/regime-radar && python3 -c "
import json, sys
from pathlib import Path
from datetime import date

# Check eval history entry
files = sorted(Path('data/models/eval_history').glob('*.json'))
if not files:
    print('ERROR: no eval history files found'); sys.exit(1)
entry = json.loads(files[-1].read_text())
end = entry['oof_eval_window']['end']
print('oof_eval_window.end:', end)
assert date.fromisoformat(end) >= date(2026, 5, 21), f'OOF window did not extend: {end}'
print('PASS: oof_eval_window.end >=', date(2026, 5, 21))

# Check oof_predictions artifact max date
import sys; sys.path.insert(0, '.')
from src.models.registry import load_artifact
oof_df = load_artifact('oof_predictions')
oof_max = str(oof_df.index.max().date())
print('oof_predictions max date:', oof_max)
assert date.fromisoformat(oof_max) >= date(2026, 5, 21), f'oof_predictions not extended: {oof_max}'
print('PASS: oof_predictions max date >=', date(2026, 5, 21))
"
```

If `oof_eval_window.end` shows `2026-04-23` (old cutoff), the walk-forward splits did not extend. Investigate before continuing.

### Step 4.4: Verify reliability table refreshed and correct

- [ ] **Check transition_reliability.json post-retrain**

```bash
cd /Users/kanuj/regime-radar && python3 -c "
import json
from pathlib import Path

t = json.loads(Path('data/reliability/transition_reliability.json').read_text())
print('--- transition_reliability.json (POST) ---')
print('max_evaluated_p:', t['max_evaluated_p'])
print('base_rate:', t['base_rate'])
print('source:', t.get('source'))
total_n = sum(b['n'] for b in t['bins'])
print('total n:', total_n)

assert t.get('source') == 'oof', f'source must be oof, got: {t.get(\"source\")}'
print('PASS: source == oof')
assert total_n > 7000, f'Expected total n > 7000 for full OOF coverage, got {total_n}'
print('PASS: total n > 7000')
"
```

Compare `max_evaluated_p`, `base_rate`, and total `n` against the pre-retrain values from Step 4.1. At least one should differ, confirming the table was rebuilt from new OOF, not old.

### Step 4.5: Verify eval history entry structure

- [ ] **Check entry has both previous_model and new_model**

```bash
cd /Users/kanuj/regime-radar && python3 -c "
import json
from pathlib import Path

files = sorted(Path('data/models/eval_history').glob('*.json'))
entry = json.loads(files[-1].read_text())

print('retrain_date:', entry['retrain_date'])
print('oof_eval_window:', entry['oof_eval_window'])
print('git_commit:', entry['git_commit'])

assert 'previous_model' in entry, 'missing previous_model'
assert 'new_model' in entry, 'missing new_model'
assert 'transition' in entry['previous_model'], 'missing previous_model.transition'
assert 'transition' in entry['new_model'], 'missing new_model.transition'
assert 'n_training_rows' in entry['new_model']['transition'], 'missing n_training_rows'
assert 'reliability' in entry['new_model'], 'missing new_model.reliability'

print('PASS: all required entry fields present')
print('previous roc_auc:', entry['previous_model']['transition'].get('mean_roc_auc'))
print('new roc_auc:', entry['new_model']['transition'].get('mean_roc_auc'))
print('n_training_rows:', entry['new_model']['transition']['n_training_rows'])
"
```

### Step 4.6: Run full test suite

- [ ] **Run all tests**

```bash
cd /Users/kanuj/regime-radar && python3 -m pytest --tb=short -q
```

Expected: all 103+ tests pass.

### Step 4.7: Commit refreshed artifacts

- [ ] **Commit the refreshed artifacts and model files**

```bash
cd /Users/kanuj/regime-radar
git add data/reliability/transition_reliability.json
git add data/models/eval_history/
git add data/models/xgb_transition/
git add data/models/xgb_regime/
git add data/models/xgb_transition_calibrator/
git add data/models/oof_predictions/
git commit -m "feat: retrain models through $(python3 -c "import json; from pathlib import Path; f=sorted(Path('data/models/eval_history').glob('*.json'))[-1]; print(json.loads(f.read_text())['oof_eval_window']['end'])")"
```

---

## Summary Checklist

After all four tasks complete, verify:

- [ ] `src/evaluation/eval_history.py` has 4 public functions (`read_pre_retrain_snapshot`, `build_post_retrain_snapshot`, `write_eval_history_entry`, `load_recent_entries`)
- [ ] `scripts/bootstrap_data.py` exposes `run_pipeline()` returning `trans_summary`, `regime_summary`, `n_training_rows`, `training_data_end_date`
- [ ] `scripts/retrain.py` is a thin orchestrator — no duplicated training logic
- [ ] `tests/test_eval_history.py` has 5 passing tests
- [ ] `tests/test_retrain_smoke.py` has 1 passing test (`--dry-run` exits 0, writes nothing, logs snapshot confirmation)
- [ ] `data/models/eval_history/YYYY-MM-DD.json` written with all required fields
- [ ] `transition_reliability.json` has `source == "oof"` and total n > 7000
- [ ] `oof_eval_window.end` and `oof_predictions` max date are both ≥ 2026-05-21
- [ ] All 103+ tests pass
