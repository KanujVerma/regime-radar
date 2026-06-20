# Sub-project A: Retrain + Reliability Rebuild + Eval History

**Date:** 2026-05-22
**Status:** Approved for implementation

---

## Problem

The OOF walk-forward covers 1995-04-07 through 2026-04-23 (7,812 rows). The most recent 20 feature rows (2026-04-24 through 2026-05-21) have no held-out evaluation. The live-serving reliability table (`transition_reliability.json`) was built from those OOF predictions, so its `max_evaluated_p` is capped at 0.30 — the highest range where OOF scores produced enough support. Current live scores (75.9%) are well above that range, showing the "directional stress signal, not a calibrated probability" warning.

The fix is to retrain on current data, generate OOF predictions through today, and rebuild the reliability table from the refreshed OOF. This extends held-out coverage, potentially pushes `max_evaluated_p` higher, and gives the upper reliability bins real validation support instead of empty bins.

---

## Scope

Sub-project A: retrain + reliability rebuild + eval history foundation.

**In scope:**
- A dedicated `scripts/retrain.py` that re-runs the full fetch → features → train → OOF → reliability cycle
- A `src/evaluation/eval_history.py` module that captures pre/post metrics per retrain run
- Tests for eval_history logic and a dry-run smoke test for retrain.py

**Explicitly out of scope:**
- Artifact versioning, staging directories, or promote/rollback workflows — artifacts are overwritten in place, same as today's `bootstrap_data.py`. Rollback safety is a Sub-project B/C concern.
- Eval gate / automated quality gating — Sub-project B reads the eval history this project produces.
- Monthly cadence / scheduling — Sub-project C.
- Production in-sample reliability table — explicitly rejected; reliability rebuild is OOF-only.

---

## Design

### Script: `scripts/retrain.py`

Single entry point for all recurring retrains. Flow:

```
1. Parse --dry-run flag
2. Read pre-retrain snapshot (eval_history.read_pre_retrain_snapshot())
   → loads current meta.json from xgb_transition, xgb_regime, transition_reliability.json
   → captures: AUC, PR-AUC, ECE, Brier, macro_f1, max_evaluated_p, base_rate, source, git commit
3. [DRY-RUN EXIT HERE — no mutations below this line in dry-run mode]
4. Fetch fresh data (spy, vix, emv → panel)
5. Build features + labels (same as bootstrap_data.py)
6. Train regime model → overwrites xgb_regime artifacts in place
7. Train transition model → overwrites xgb_transition, xgb_transition_calibrator, oof_predictions in place
8. Rebuild OOF reliability table → build_oof_table() → writes transition_reliability.json
9. Build post-retrain snapshot (eval_history.build_post_retrain_snapshot())
10. Write eval history entry (eval_history.write_eval_history_entry())
    → only reached if steps 4-8 all succeeded
11. Print summary: AUC delta, max_evaluated_p before/after, oof_eval_window.end
```

**Artifact overwrite tradeoff:** Steps 6–7 overwrite model artifacts in place. This is the same behavior as `bootstrap_data.py` today. If training fails mid-way, artifacts may be in a partial state — this risk is accepted and out of scope for Sub-project A. The eval history entry (step 10) is written last; a partial/failed retrain produces no history entry, so Sub-project B will not see a corrupt record.

**`--dry-run` behavior (locked):**
- Executes steps 1–3 only
- Reads current artifacts and validates the pre-retrain snapshot
- Exits with code 0 if snapshot builds successfully
- Writes nothing: no data fetched, no models trained, no reliability rebuilt, no eval history written
- Any mutation after step 3 does not occur in dry-run mode

---

### Module: `src/evaluation/eval_history.py`

Single responsibility: read and write eval history entries. Sub-project B imports this module directly.

**Functions:**

```python
def read_pre_retrain_snapshot(git_commit: str | None = None) -> dict:
    """Load current artifact meta.json files and reliability table into a structured dict.
    
    Reads from:
      - data/models/xgb_transition/meta.json
      - data/models/xgb_regime/meta.json
      - data/reliability/transition_reliability.json
    
    Missing keys in meta.json are omitted (not raised) — handles older artifacts
    that predate certain metrics fields. Returns empty sub-dicts if an artifact
    file does not exist.
    """

def build_post_retrain_snapshot(
    trans_summary: dict,
    regime_summary: dict,
    reliability_table: dict,
    n_training_rows: int,
    oof_eval_window: dict,
) -> dict:
    """Construct post-training metrics dict from training return values."""

def write_eval_history_entry(
    pre: dict,
    post: dict,
    training_data_end_date: str,
    oof_eval_window: dict,
    git_commit: str | None,
) -> Path:
    """Write data/models/eval_history/YYYY-MM-DD.json.
    
    Creates the directory if it does not exist (mkdir parents=True, exist_ok=True).
    Raises if the file already exists for today's date (prevents accidental overwrite
    on same-day reruns — caller must rename or delete manually).
    Returns the path written.
    """

def load_recent_entries(n: int = 2) -> list[dict]:
    """Load the last N eval history entries sorted newest-first.
    
    Raises ValueError on any malformed (non-parseable) JSON file encountered
    within the most recent N entries. Does not silently skip bad files.
    Returns an empty list if the eval_history directory does not exist or is empty.
    """
```

**Behavior on malformed entries:** `load_recent_entries` raises `ValueError` loudly if any of the N requested entries contain malformed JSON. Silent skipping is explicitly rejected — Sub-project B's gating logic must not silently drop comparison points.

---

### Eval History JSON Schema

File: `data/models/eval_history/YYYY-MM-DD.json`

```json
{
  "retrain_date": "2026-05-22",
  "timestamp": "2026-05-22T18:00:00+00:00",
  "git_commit": "cc9df08",
  "training_data_end_date": "2026-05-21",
  "oof_eval_window": {
    "start": "1995-04-07",
    "end": "2026-05-21"
  },
  "previous_model": {
    "transition": {
      "mean_roc_auc": 0.82,
      "mean_pr_auc": 0.35,
      "brier_calibrated": 0.07,
      "ece_calibrated": 0.02,
      "n_folds": 18
    },
    "regime": {
      "mean_macro_f1": 0.78
    },
    "reliability": {
      "max_evaluated_p": 0.30,
      "base_rate": 0.0914,
      "source": "oof"
    }
  },
  "new_model": {
    "transition": {
      "mean_roc_auc": 0.83,
      "mean_pr_auc": 0.36,
      "brier_calibrated": 0.068,
      "ece_calibrated": 0.019,
      "n_folds": 18,
      "n_training_rows": 7832
    },
    "regime": {
      "mean_macro_f1": 0.79
    },
    "reliability": {
      "max_evaluated_p": 0.35,
      "base_rate": 0.0918,
      "source": "oof"
    }
  }
}
```

**Notes:**
- `oof_eval_window.end` comes from `max(oof_predictions.index)` on the newly-generated artifact — the true end of held-out evaluation, not the feature matrix end date.
- `previous_model` fields are sourced from existing `meta.json` files. Missing keys (e.g., `brier_calibrated` absent in older meta) are omitted rather than raising — Sub-project B uses `dict.get()` defensively.
- `git_commit` is obtained via `git rev-parse --short HEAD` at script start; if git is unavailable, the field is `null`.

---

### Files

| File | Action |
|---|---|
| `scripts/retrain.py` | Create |
| `src/evaluation/eval_history.py` | Create |
| `data/models/eval_history/.gitkeep` | Create (tracks directory in git) |
| `tests/test_eval_history.py` | Create |
| `tests/test_retrain_smoke.py` | Create |

---

### Tests

**`tests/test_eval_history.py`** — 5 unit tests:

1. `test_read_pre_retrain_snapshot_extracts_expected_fields` — patch `load_metadata` / json.load with fixture data; verify output contains `transition.mean_roc_auc`, `regime.mean_macro_f1`, `reliability.max_evaluated_p`
2. `test_write_eval_history_creates_valid_json` — write an entry to a tmp dir, read it back, assert all required top-level fields present
3. `test_write_eval_history_uses_date_filename` — verify file named `YYYY-MM-DD.json` matching `retrain_date`
4. `test_write_eval_history_creates_missing_directory` — write to a non-existent subdirectory, verify directory created
5. `test_load_recent_entries_raises_on_malformed_json` — write a valid entry and a malformed entry, call `load_recent_entries(n=2)`, verify `ValueError` is raised

**`tests/test_retrain_smoke.py`** — 1 test:

`test_dry_run_exits_cleanly` — invoke `retrain.py --dry-run` via `subprocess.run`, assert exit code 0, assert no files were created/modified in `data/models/eval_history/`

---

### Verification (OOF gap closure)

After running `retrain.py`, the following must be explicitly verified before declaring success:

1. **OOF window extended:** `oof_eval_window.end` in the written eval history entry must be ≥ 2026-05-21 (the current feature matrix end date). If it equals 2026-04-23 (old cutoff), the walk-forward splits did not extend.

2. **Reliability table refreshed from new OOF:** `data/reliability/transition_reliability.json` must have a modification timestamp after the retrain run, and its `base_rate` + bin distribution must differ from the pre-retrain snapshot (confirming it was rebuilt from the new artifact, not the old one).

3. **Smoke test passes:** All existing 97+ tests continue to pass.

---

## What This Does Not Change

- `bootstrap_data.py` — unchanged, remains first-time setup only
- Artifact file paths and loading model — unchanged
- API endpoints — unchanged
- Frontend — unchanged (reliability table is still OOF-sourced with `source: "oof"`)
- Live scheduler in `state.py` — unchanged (still re-scores with existing trained artifacts on every refresh)
