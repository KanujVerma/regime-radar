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
_RELIABILITY_PATH: Path = MODELS_DIR.parent / "reliability" / "transition_reliability.json"


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

    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    path = EVAL_HISTORY_DIR / f"{today}.json"

    if path.exists():
        raise FileExistsError(
            f"Eval history entry already exists for {today}: {path}. "
            "Delete or rename it before running retrain again today."
        )

    entry = {
        "retrain_date": today,
        "timestamp": now.isoformat(),
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
