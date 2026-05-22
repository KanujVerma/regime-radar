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
