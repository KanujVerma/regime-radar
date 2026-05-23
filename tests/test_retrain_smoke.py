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
