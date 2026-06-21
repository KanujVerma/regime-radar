"""Smoke test for scripts/retrain.py --dry-run.

Verifies:
  - exits with code 0
  - writes no files to data/models/eval_history/
  - stdout/stderr contains a recognizable message confirming the pre-snapshot loaded
"""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path

import pytest


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


def test_allow_stale_flag_is_recognized():
    result = subprocess.run(
        [sys.executable, str(RETRAIN_SCRIPT), "--help"],
        capture_output=True, text=True, cwd=str(RETRAIN_SCRIPT.parent.parent),
    )
    assert result.returncode == 0
    assert "--allow-stale" in result.stdout


def test_retrain_aborts_on_stale_data(monkeypatch):
    """run_pipeline raising StaleDataError -> exit 1, and no eval_history written."""
    import scripts.retrain as rt        # runs retrain top-level: makes 'bootstrap_data' importable
    import bootstrap_data as bd          # the same module name retrain imports inside main()
    from src.data.freshness import StaleDataError

    before = set(EVAL_HISTORY_DIR.glob("*.json")) if EVAL_HISTORY_DIR.exists() else set()

    def _raise(*a, **k):
        raise StaleDataError(["source 'emv' cache ends 2026-03-01"])

    monkeypatch.setattr(bd, "run_pipeline", _raise)
    monkeypatch.setattr(sys, "argv", ["retrain.py"])

    with pytest.raises(SystemExit) as ei:
        rt.main()
    assert ei.value.code == 1

    after = set(EVAL_HISTORY_DIR.glob("*.json")) if EVAL_HISTORY_DIR.exists() else set()
    assert after - before == set()       # later retrain steps (eval history) never ran
