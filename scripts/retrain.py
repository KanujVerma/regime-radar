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
