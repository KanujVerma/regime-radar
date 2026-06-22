# Predictability-Ceiling Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine, with evidence, whether any reasonable transition-label/horizon variant can honestly push the validated transition-probability ceiling above its current ~0.30 — so we can decide between pursuing a model rebuild (Branch A) vs. a falsifiable severity rail (Branch B).

**Architecture:** A self-contained, **read-only** diagnostic that reuses the cached `data/processed/panel.parquet`, replicates the walk-forward OOF loop *without persisting any model artifacts*, sweeps a small grid of label variants, and emits decision-grade metrics + a verdict report. Two prongs: (1) the predictability-ceiling sweep, (2) an out-of-support / extrapolation-distance measurement in the 6-D scenario condition space. Nothing under `data/models/` or `data/reliability/` is ever written; all output goes to a new `data/diagnostics/` tree.

**Tech Stack:** Python 3.11+ (run with `python3.13` on this machine — bare `python3` lacks the deps), pandas, numpy, xgboost, scipy, matplotlib, pytest, monkeypatch.

**Spec source:** session debate 2026-06-20 (predictability-ceiling diagnostic + Branch A/B strategy). Companion roadmap: `docs/superpowers/specs/2026-06-20-roadmap.md`.

**Decisions locked in this plan:**
- The diagnostic **never** calls `train_transition_model` / `save_artifact`. It has its own `oof_walk_forward` helper (≈25 lines duplicated from `src/models/train_transition_model.py:55-94`). Read-only safety beats DRY for a throwaway diagnostic.
- Binning reuses production logic: `_build_bins`, `_max_evaluated_p`, `MIN_N`, `OOF_BIN_EDGES` imported from `scripts/build_reliability_table.py` (keeps the ceiling definition identical to production).
- Current baseline label: `horizon_days=5, persistence_days=3` (from `configs/labels.yaml` → `get_config("labels")["transition"]`), base rate ~0.091.
- Walk-forward config: `min_train_days=1260, test_days=63, calibration_holdout_fraction=0.20` (from `get_config("model")["walk_forward"]`), ~104 folds.
- **Pre-registered decision rule** (set before results, no goalpost-moving):
  - **Branch A (headroom exists):** some variant achieves `max_validated_p ≥ 0.50` AND `top1pct_emp ≥ 0.50` AND `monotonic_ok` to that point AND `pr_auc` materially above its base rate.
  - **Branch B (no headroom):** across ALL variants `max_validated_p ≤ 0.35` and `top1pct_emp ≤ 0.35`.
  - **Branch A-minus (partial):** best lands in (0.35, 0.50).
- Scenario condition subspace (Prong 2): the 6 features in `SCENARIO_BASELINE_FEATURES` (`src/api/condition_features.py`): `vix_level, vix_chg_5d, rv_20d_pct, drawdown_pct_504d, ret_20d, dist_sma50`.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/evaluation/ceiling_diagnostic.py` | Create | Pure helpers: `oof_walk_forward`, `ceiling_metrics`, `LABEL_VARIANTS`, `build_variant_label` |
| `tests/test_ceiling_diagnostic.py` | Create | Unit tests for the helpers above (synthetic data, no network) |
| `src/evaluation/support_distance.py` | Create | Prong 2: `standardize_reference`, `nn_distance`, `build_support_report` |
| `tests/test_support_distance.py` | Create | Unit tests for the support/extrapolation prong |
| `scripts/run_ceiling_diagnostic.py` | Create | CLI orchestrator: run sweep + prong 2, write artifacts + `report.md` + branch verdict |
| `tests/test_ceiling_diagnostic_cli.py` | Create | Smoke test: orchestrator on a tiny fixture writes all artifacts, touches no production paths |

**Output tree (created at runtime, git-ignored):**
```
data/diagnostics/
  ceiling/
    <variant>/reliability.json
    reliability_<variant>.png
    summary.csv
    report.md
  extrapolation/
    support_report.json
```

**Run all tests with:** `python3.13 -m pytest tests/test_ceiling_diagnostic.py tests/test_support_distance.py tests/test_ceiling_diagnostic_cli.py -q`

**Full diagnostic run (after all tasks):** `python3.13 scripts/run_ceiling_diagnostic.py`

---

## Task 1: read-only OOF walk-forward helper

**Files:**
- Create: `src/evaluation/ceiling_diagnostic.py`
- Test: `tests/test_ceiling_diagnostic.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ceiling_diagnostic.py
import numpy as np
import pandas as pd
from src.evaluation.ceiling_diagnostic import oof_walk_forward


def _synthetic(n=1600, seed=0):
    rng = np.random.default_rng(seed)
    # one informative feature: higher x -> higher P(y=1)
    x = rng.normal(size=n)
    p = 1 / (1 + np.exp(-(x - 1.5)))  # base rate well below 0.5
    y = (rng.uniform(size=n) < p).astype(int)
    idx = pd.date_range("2010-01-01", periods=n, freq="B")
    X = pd.DataFrame({"x": x, "noise": rng.normal(size=n)}, index=idx)
    return X, pd.Series(y, index=idx, name="transition_up")


def test_oof_walk_forward_returns_aligned_oof_frame():
    X, y = _synthetic()
    wf_cfg = {"min_train_days": 500, "test_days": 250, "calibration_holdout_fraction": 0.2}
    xgb_cfg = {"n_estimators": 40, "max_depth": 3, "learning_rate": 0.1,
               "objective": "binary:logistic", "eval_metric": "logloss"}
    out = oof_walk_forward(X, y, wf_cfg, xgb_cfg)
    # Returns a DataFrame indexed by date with raw/cal/y columns
    assert set(out.columns) == {"oof_raw", "oof_cal", "y"}
    # Only test-fold rows are scored (burn-in rows are NaN-dropped)
    assert out["oof_raw"].notna().all()
    assert len(out) > 0
    assert out.index.is_monotonic_increasing


def test_oof_walk_forward_persists_nothing(tmp_path, monkeypatch):
    # Guard: the helper must never call save_artifact.
    import src.evaluation.ceiling_diagnostic as cd
    if hasattr(cd, "save_artifact"):
        def _boom(*a, **k):
            raise AssertionError("diagnostic must not persist artifacts")
        monkeypatch.setattr(cd, "save_artifact", _boom, raising=False)
    X, y = _synthetic(n=900)
    wf_cfg = {"min_train_days": 400, "test_days": 200, "calibration_holdout_fraction": 0.2}
    xgb_cfg = {"n_estimators": 20, "max_depth": 2, "learning_rate": 0.1,
               "objective": "binary:logistic", "eval_metric": "logloss"}
    oof_walk_forward(X, y, wf_cfg, xgb_cfg)  # must not raise
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_ceiling_diagnostic.py -k oof_walk_forward -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.evaluation.ceiling_diagnostic'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/evaluation/ceiling_diagnostic.py
"""Read-only predictability-ceiling diagnostic helpers.

This module NEVER persists model artifacts. It replicates the walk-forward OOF
loop from src/models/train_transition_model.py (minus save_artifact) so it can be
run repeatedly over label variants without mutating production models/reliability.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
import xgboost as xgb

from src.evaluation.walk_forward import walk_forward_splits
from src.evaluation.calibration import fit_calibrator, apply_calibrator


def oof_walk_forward(
    X: pd.DataFrame,
    y: pd.Series,
    wf_cfg: dict,
    xgb_cfg: dict,
) -> pd.DataFrame:
    """Produce out-of-fold raw + calibrated transition scores. Persists nothing.

    Mirrors the per-fold procedure in train_transition_model: each fold carves its
    last `calibration_holdout_fraction` as a calibration holdout, fits XGB on the
    rest, fits an auto calibrator on the holdout, scores the test fold.

    Returns a DataFrame indexed by date with columns: oof_raw, oof_cal, y
    (NaN burn-in rows dropped).
    """
    y = y.astype(int)
    n = len(X)
    holdout_frac = wf_cfg.get("calibration_holdout_fraction", 0.20)
    oof_raw = pd.Series(np.nan, index=X.index)
    oof_cal = pd.Series(np.nan, index=X.index)

    for tr_idx, te_idx in walk_forward_splits(n, wf_cfg["min_train_days"], wf_cfg["test_days"]):
        cal_size = max(1, int(len(tr_idx) * holdout_frac))
        model_tr_idx = tr_idx[:-cal_size]
        cal_idx = tr_idx[-cal_size:]

        X_model_tr, y_model_tr = X.iloc[model_tr_idx], y.iloc[model_tr_idx]
        X_cal, y_cal = X.iloc[cal_idx], y.iloc[cal_idx]
        X_test = X.iloc[te_idx]

        pos = y_model_tr.sum()
        neg = (y_model_tr == 0).sum()
        spw = float(neg / pos) if pos > 0 else 1.0

        model = xgb.XGBClassifier(**xgb_cfg, scale_pos_weight=spw, random_state=42, verbosity=0)
        model.fit(X_model_tr, y_model_tr)

        calibrator = fit_calibrator(y_cal.values, model.predict_proba(X_cal)[:, 1], method="auto")
        test_raw = model.predict_proba(X_test)[:, 1]
        oof_raw.iloc[te_idx] = test_raw
        oof_cal.iloc[te_idx] = apply_calibrator(calibrator, test_raw)

    out = pd.DataFrame({"oof_raw": oof_raw, "oof_cal": oof_cal, "y": y})
    return out[out["oof_cal"].notna()].sort_index()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_ceiling_diagnostic.py -k oof_walk_forward -q`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/evaluation/ceiling_diagnostic.py tests/test_ceiling_diagnostic.py
git commit -m "feat(diagnostic): read-only OOF walk-forward helper (persists nothing)"
```

---

## Task 2: ceiling metrics

**Files:**
- Modify: `src/evaluation/ceiling_diagnostic.py`
- Test: `tests/test_ceiling_diagnostic.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ceiling_diagnostic.py  (append)
from src.evaluation.ceiling_diagnostic import ceiling_metrics


def _oof_frame(cal, y):
    idx = pd.date_range("2012-01-01", periods=len(cal), freq="B")
    return pd.DataFrame({"oof_raw": cal, "oof_cal": cal, "y": y}, index=idx)


def test_ceiling_metrics_low_ceiling_when_scores_capped():
    # 400 rows, scores never exceed 0.30, ~9% base rate -> low ceiling
    rng = np.random.default_rng(1)
    cal = rng.uniform(0.0, 0.30, size=400)
    y = (rng.uniform(size=400) < 0.09).astype(int)
    m = ceiling_metrics(_oof_frame(cal, y))
    assert m["max_validated_p"] <= 0.30
    assert m["cal_max"] <= 0.30
    assert 0.0 <= m["base_rate"] <= 0.2
    assert set(m).issuperset({
        "base_rate", "max_validated_p", "top1pct_emp", "top5pct_emp",
        "raw_max", "cal_max", "monotonic_ok", "roc_auc", "pr_auc", "n_oof",
    })


def test_ceiling_metrics_top_group_tracks_outcomes():
    # Construct scores perfectly ranking outcomes: top group should be ~all positive.
    n = 1000
    y = np.array([0] * 900 + [1] * 100)
    cal = np.concatenate([np.linspace(0.0, 0.4, 900), np.linspace(0.6, 0.95, 100)])
    m = ceiling_metrics(_oof_frame(cal, y))
    assert m["top1pct_emp"] >= 0.9   # top 1% are all the high-score positives
    assert m["roc_auc"] > 0.95
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_ceiling_diagnostic.py -k ceiling_metrics -q`
Expected: FAIL — `ImportError: cannot import name 'ceiling_metrics'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/evaluation/ceiling_diagnostic.py  (append)
import math
import sys
from pathlib import Path
from scipy.stats import spearmanr
from sklearn.metrics import roc_auc_score, average_precision_score

# Reuse production binning so the ceiling definition is identical to the live table.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from build_reliability_table import _build_bins, _max_evaluated_p, MIN_N, OOF_BIN_EDGES  # noqa: E402


def _top_group_rate(p: np.ndarray, y: np.ndarray, frac: float) -> float:
    """Empirical positive rate among the top `frac` of scores (n>=MIN_N, else NaN)."""
    k = max(MIN_N, math.ceil(frac * len(p)))
    if k > len(p):
        return float("nan")
    order = np.argsort(p)[::-1][:k]
    return float(np.mean(y[order]))


def ceiling_metrics(oof: pd.DataFrame) -> dict:
    """Decision-grade ceiling metrics for one label variant's OOF scores."""
    p = oof["oof_cal"].to_numpy(dtype=float)
    raw = oof["oof_raw"].to_numpy(dtype=float)
    y = oof["y"].to_numpy(dtype=int)

    bins, base_rate = _build_bins(p, y, OOF_BIN_EDGES)
    populated = [b for b in bins if b["n"] >= MIN_N]
    if len(populated) >= 2:
        rho, _ = spearmanr([b["p_mid"] for b in populated],
                           [b["empirical_rate"] for b in populated])
        monotonic_ok = bool(rho is not None and rho > 0.9)
    else:
        monotonic_ok = False

    roc = float(roc_auc_score(y, p)) if 0 < y.sum() < len(y) else float("nan")
    pr = float(average_precision_score(y, p)) if 0 < y.sum() < len(y) else float("nan")

    return {
        "n_oof": int(len(oof)),
        "base_rate": round(base_rate, 4),
        "max_validated_p": _max_evaluated_p(bins),
        "top1pct_emp": round(_top_group_rate(p, y, 0.01), 4),
        "top5pct_emp": round(_top_group_rate(p, y, 0.05), 4),
        "raw_max": round(float(np.max(raw)), 4),
        "cal_max": round(float(np.max(p)), 4),
        "monotonic_ok": monotonic_ok,
        "roc_auc": round(roc, 4),
        "pr_auc": round(pr, 4),
        "bins": bins,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_ceiling_diagnostic.py -k ceiling_metrics -q`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/evaluation/ceiling_diagnostic.py tests/test_ceiling_diagnostic.py
git commit -m "feat(diagnostic): ceiling_metrics (max_validated_p, top-group rate, monotonicity)"
```

---

## Task 3: label variants + variant builder

**Files:**
- Modify: `src/evaluation/ceiling_diagnostic.py`
- Test: `tests/test_ceiling_diagnostic.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ceiling_diagnostic.py  (append)
from src.evaluation.ceiling_diagnostic import LABEL_VARIANTS, build_variant_label


def test_label_variants_are_the_pre_registered_grid():
    names = {v["name"] for v in LABEL_VARIANTS}
    # baseline + horizon sweep + persistence sweep (<=8 runs)
    assert "baseline_h5_p3" in names
    assert {"h10_p3", "h21_p3", "h42_p3", "h63_p3"}.issubset(names)
    assert {"h5_p1", "h21_p1"}.issubset(names)
    assert len(LABEL_VARIANTS) <= 8
    for v in LABEL_VARIANTS:
        assert v["horizon_days"] >= 1 and v["persistence_days"] >= 1


def test_build_variant_label_changes_base_rate_with_horizon():
    # Longer horizon -> at least as many positives as the baseline.
    regimes = pd.Series(
        (["calm"] * 10 + ["elevated"] * 2) * 40,
        index=pd.date_range("2015-01-01", periods=480, freq="B"),
    )
    y5 = build_variant_label(regimes, horizon_days=5, persistence_days=1)
    y42 = build_variant_label(regimes, horizon_days=42, persistence_days=1)
    assert y42.sum() >= y5.sum()
    assert set(y5.unique()).issubset({0, 1})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_ceiling_diagnostic.py -k "variants or variant_label" -q`
Expected: FAIL — `ImportError: cannot import name 'LABEL_VARIANTS'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/evaluation/ceiling_diagnostic.py  (append)
from src.labeling.build_transition_labels import build_transition_labels

# Pre-registered sweep (<=8 runs): baseline + horizon sweep + persistence sweep.
LABEL_VARIANTS = [
    {"name": "baseline_h5_p3", "horizon_days": 5, "persistence_days": 3},
    {"name": "h10_p3", "horizon_days": 10, "persistence_days": 3},
    {"name": "h21_p3", "horizon_days": 21, "persistence_days": 3},
    {"name": "h42_p3", "horizon_days": 42, "persistence_days": 3},
    {"name": "h63_p3", "horizon_days": 63, "persistence_days": 3},
    {"name": "h5_p1", "horizon_days": 5, "persistence_days": 1},
    {"name": "h21_p1", "horizon_days": 21, "persistence_days": 1},
]


def build_variant_label(regime_series: pd.Series, horizon_days: int, persistence_days: int) -> pd.Series:
    """Build the transition-up label for a given horizon/persistence variant."""
    return build_transition_labels(
        regime_series,
        config={"horizon_days": horizon_days, "persistence_days": persistence_days},
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_ceiling_diagnostic.py -k "variants or variant_label" -q`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/evaluation/ceiling_diagnostic.py tests/test_ceiling_diagnostic.py
git commit -m "feat(diagnostic): pre-registered label-variant grid + builder"
```

---

## Task 4: extrapolation / out-of-support prong

**Files:**
- Create: `src/evaluation/support_distance.py`
- Test: `tests/test_support_distance.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_support_distance.py
import numpy as np
import pandas as pd
from src.evaluation.support_distance import (
    standardize_reference, nn_distance, build_support_report,
)


def _ref(n=500, seed=0):
    rng = np.random.default_rng(seed)
    cols = ["vix_level", "vix_chg_5d", "rv_20d_pct", "drawdown_pct_504d", "ret_20d", "dist_sma50"]
    return pd.DataFrame(rng.normal(size=(n, len(cols))), columns=cols)


def test_nn_distance_zero_for_in_distribution_point():
    ref = _ref()
    mean, std = standardize_reference(ref)
    z_ref = (ref - mean) / std
    # A point equal to a reference row has ~0 nearest-neighbour distance.
    probe = ref.iloc[10]
    d = nn_distance((probe - mean) / std, z_ref.to_numpy())
    assert d < 1e-6


def test_nn_distance_large_for_extreme_extrapolation():
    ref = _ref()
    mean, std = standardize_reference(ref)
    z_ref = (ref - mean) / std
    probe = ref.mean() + 50 * ref.std()   # absurd extrapolation
    d = nn_distance((probe - mean) / std, z_ref.to_numpy())
    assert d > 10


def test_build_support_report_flags_extrapolation_fraction():
    ref = _ref()
    report = build_support_report(ref, z_threshold=3.0)
    assert 0.0 <= report["extrapolation_fraction"] <= 1.0
    assert "probes" in report and len(report["probes"]) > 0
    # Each probe row records its multiplier and whether it has an analog.
    for pr in report["probes"]:
        assert "label" in pr and "nn_z_distance" in pr and "in_support" in pr
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_support_distance.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.evaluation.support_distance'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/evaluation/support_distance.py
"""Prong 2: how much of the scenario input space has any historical analog.

Works in the 6-D scenario condition subspace (SCENARIO_BASELINE_FEATURES). Builds
probe points by pushing each condition toward and beyond its historical extreme,
then measures nearest-neighbour distance (in z-units) to the historical distribution.
A probe with no neighbour within `z_threshold` is genuine extrapolation — a region
no model can validate, regardless of any label/model rebuild.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

from src.api.condition_features import SCENARIO_BASELINE_FEATURES

# Joint multipliers applied to the historical column extremes to build probes.
PROBE_QUANTILES = {"p95": 0.95, "p99": 0.99, "max": 1.0}
PROBE_BEYOND = {"x1.25_max": 1.25, "x1.5_max": 1.5}


def standardize_reference(ref: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """Return (mean, std) for z-scoring; std floored to avoid divide-by-zero."""
    mean = ref.mean()
    std = ref.std().replace(0.0, 1e-9)
    return mean, std


def nn_distance(z_point: pd.Series, z_ref: np.ndarray) -> float:
    """Euclidean distance (z-units) from a standardized point to its nearest ref row."""
    diffs = z_ref - z_point.to_numpy()
    return float(np.sqrt((diffs ** 2).sum(axis=1)).min())


def build_support_report(features: pd.DataFrame, z_threshold: float = 3.0) -> dict:
    """Measure extrapolation across joint-extreme probes of the condition subspace."""
    cols = [c for c in SCENARIO_BASELINE_FEATURES if c in features.columns]
    ref = features[cols].dropna()
    mean, std = standardize_reference(ref)
    z_ref = ((ref - mean) / std).to_numpy()

    probes = []
    # In-distribution quantile probes.
    for label, q in PROBE_QUANTILES.items():
        point = ref.quantile(q) if q < 1.0 else ref.max()
        d = nn_distance((point - mean) / std, z_ref)
        probes.append({"label": label, "nn_z_distance": round(d, 4), "in_support": d <= z_threshold})
    # Beyond-historical probes (what the scenario sliders let users reach).
    col_max = ref.max()
    for label, mult in PROBE_BEYOND.items():
        point = col_max * mult
        d = nn_distance((point - mean) / std, z_ref)
        probes.append({"label": label, "nn_z_distance": round(d, 4), "in_support": d <= z_threshold})

    extrap = [p for p in probes if not p["in_support"]]
    return {
        "condition_features": cols,
        "z_threshold": z_threshold,
        "n_reference_rows": int(len(ref)),
        "extrapolation_fraction": round(len(extrap) / len(probes), 4),
        "probes": probes,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_support_distance.py -q`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/evaluation/support_distance.py tests/test_support_distance.py
git commit -m "feat(diagnostic): out-of-support extrapolation distance (prong 2)"
```

---

## Task 5: CLI orchestrator + verdict report

**Files:**
- Create: `scripts/run_ceiling_diagnostic.py`
- Test: `tests/test_ceiling_diagnostic_cli.py`
- Modify: `.gitignore` (ignore `data/diagnostics/`)

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ceiling_diagnostic_cli.py
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
import scripts.run_ceiling_diagnostic as rcd


def _tiny_panel(n=1700, seed=3):
    """A panel small enough to run a few folds fast but real-shaped.

    IMPORTANT: before writing this fixture, READ src/features/build_market_features.py
    and src/labeling/build_regime_labels.py and include EXACTLY the panel columns they
    require (e.g. the close/vix/ret columns they index by name). The column set below
    is a starting point — adjust it to whatever build_features/build_regime_labels read,
    or the smoke test will fail at feature construction. This is the most fragile task;
    let the failing-test loop drive the exact column set.
    """
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2010-01-01", periods=n, freq="B")
    close = 100 * np.cumprod(1 + rng.normal(0, 0.01, size=n))
    vix = np.clip(15 + 5 * rng.normal(size=n).cumsum() / np.sqrt(np.arange(1, n + 1)), 9, 80)
    return pd.DataFrame({"spy_close": close, "vixcls": vix}, index=idx)


def test_decide_branch_rule():
    # Pure decision-rule unit: thresholds are pre-registered.
    a = [{"max_validated_p": 0.55, "top1pct_emp": 0.6, "monotonic_ok": True, "pr_auc": 0.4, "base_rate": 0.1}]
    assert rcd.decide_branch(a) == "A"
    b = [{"max_validated_p": 0.30, "top1pct_emp": 0.2, "monotonic_ok": True, "pr_auc": 0.2, "base_rate": 0.1}]
    assert rcd.decide_branch(b) == "B"
    mid = [{"max_validated_p": 0.42, "top1pct_emp": 0.4, "monotonic_ok": True, "pr_auc": 0.3, "base_rate": 0.1}]
    assert rcd.decide_branch(mid) == "A-minus"


def test_cli_writes_all_artifacts_and_touches_no_production(tmp_path, monkeypatch):
    out_root = tmp_path / "diagnostics"
    monkeypatch.setattr(rcd, "DIAGNOSTICS_DIR", out_root)
    # Run on a tiny panel + a reduced 2-variant grid for speed.
    monkeypatch.setattr(rcd.cd, "LABEL_VARIANTS", [
        {"name": "baseline_h5_p3", "horizon_days": 5, "persistence_days": 3},
        {"name": "h21_p3", "horizon_days": 21, "persistence_days": 3},
    ])
    # Guard: fail if anything tries to persist a model artifact.
    import src.models.registry as reg
    monkeypatch.setattr(reg, "save_artifact",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("no writes to models")))

    rcd.run(panel=_tiny_panel(), min_train_days=600, test_days=300)

    assert (out_root / "ceiling" / "summary.csv").exists()
    assert (out_root / "ceiling" / "report.md").exists()
    assert (out_root / "extrapolation" / "support_report.json").exists()
    report = (out_root / "ceiling" / "report.md").read_text()
    assert "Branch" in report
    # Verdict JSON is parseable from summary
    rows = pd.read_csv(out_root / "ceiling" / "summary.csv")
    assert {"variant", "max_validated_p", "top1pct_emp", "pr_auc"}.issubset(rows.columns)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_ceiling_diagnostic_cli.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'scripts.run_ceiling_diagnostic'`

- [ ] **Step 3: Write minimal implementation**

```python
# scripts/run_ceiling_diagnostic.py
"""Predictability-ceiling diagnostic orchestrator (read-only w.r.t. production).

Sweeps the pre-registered label-variant grid, computes ceiling metrics per variant,
measures out-of-support extrapolation, and writes a verdict report selecting Branch
A / A-minus / B per the pre-registered decision rule. Writes ONLY under
data/diagnostics/. Never trains/saves the production model.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.utils.config import get_config
from src.utils.paths import PROCESSED_DIR, get_project_root
from src.labeling.build_regime_labels import build_regime_labels
from src.features.build_market_features import build_features
import src.evaluation.ceiling_diagnostic as cd
from src.evaluation.support_distance import build_support_report

DIAGNOSTICS_DIR = get_project_root() / "data" / "diagnostics"


def decide_branch(metrics: list[dict]) -> str:
    """Pre-registered decision rule. A > A-minus > B."""
    best_mvp = max(m["max_validated_p"] for m in metrics)
    branch_a = any(
        m["max_validated_p"] >= 0.50 and m["top1pct_emp"] >= 0.50
        and m["monotonic_ok"] and m["pr_auc"] > m["base_rate"] * 1.5
        for m in metrics
    )
    if branch_a:
        return "A"
    if best_mvp <= 0.35 and all(m["top1pct_emp"] <= 0.35 for m in metrics):
        return "B"
    return "A-minus"


def _plot_reliability(bins: list[dict], path: Path, title: str) -> None:
    xs = [b["p_mid"] for b in bins]
    ys = [b["empirical_rate"] for b in bins]
    ns = [b["n"] for b in bins]
    fig, ax = plt.subplots(figsize=(5, 4))
    ax.plot([0, 1], [0, 1], "--", color="gray", linewidth=0.8)
    ax.plot(xs, ys, "o-")
    for x, y, n in zip(xs, ys, ns):
        ax.annotate(str(n), (x, y), fontsize=7)
    ax.set_xlabel("predicted p (bin mid)")
    ax.set_ylabel("empirical rate")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def run(panel: pd.DataFrame | None = None, min_train_days: int | None = None,
        test_days: int | None = None) -> str:
    ceiling_dir = DIAGNOSTICS_DIR / "ceiling"
    extrap_dir = DIAGNOSTICS_DIR / "extrapolation"
    ceiling_dir.mkdir(parents=True, exist_ok=True)
    extrap_dir.mkdir(parents=True, exist_ok=True)

    if panel is None:
        panel = pd.read_parquet(PROCESSED_DIR / "panel.parquet")

    model_cfg = get_config("model")
    wf_cfg = dict(model_cfg["walk_forward"])
    if min_train_days is not None:
        wf_cfg["min_train_days"] = min_train_days
    if test_days is not None:
        wf_cfg["test_days"] = test_days
    xgb_cfg = {k: v for k, v in model_cfg["xgboost_transition"].items()
               if k not in ("use_label_encoder", "scale_pos_weight")}

    regime = build_regime_labels(panel)
    features = build_features(panel, regime_series=regime).dropna()
    regime_aligned = regime.reindex(features.index)

    rows, metrics_list = [], []
    for v in cd.LABEL_VARIANTS:
        y = cd.build_variant_label(regime_aligned, v["horizon_days"], v["persistence_days"])
        y = y.reindex(features.index).fillna(0).astype(int)
        oof = cd.oof_walk_forward(features, y, wf_cfg, xgb_cfg)
        m = cd.ceiling_metrics(oof)

        vdir = ceiling_dir / v["name"]
        vdir.mkdir(parents=True, exist_ok=True)
        (vdir / "reliability.json").write_text(json.dumps(
            {k: m[k] for k in m if k != "bins"} | {"bins": m["bins"]}, indent=2))
        _plot_reliability(m["bins"], ceiling_dir / f"reliability_{v['name']}.png",
                          f"{v['name']} (max_validated_p={m['max_validated_p']})")

        rows.append({"variant": v["name"], **{k: m[k] for k in m if k != "bins"}})
        metrics_list.append(m)

    summary = pd.DataFrame(rows)
    summary.to_csv(ceiling_dir / "summary.csv", index=False)

    support = build_support_report(features)
    (extrap_dir / "support_report.json").write_text(json.dumps(support, indent=2))

    branch = decide_branch(metrics_list)
    _write_report(ceiling_dir / "report.md", branch, summary, support)
    return branch


def _write_report(path: Path, branch: str, summary: pd.DataFrame, support: dict) -> None:
    lines = [
        "# Predictability-Ceiling Diagnostic — Verdict",
        "",
        f"**Branch: {branch}**",
        "",
        "## Per-variant metrics",
        "",
        summary.to_markdown(index=False),
        "",
        "## Out-of-support (extrapolation)",
        "",
        f"- reference rows: {support['n_reference_rows']}",
        f"- extrapolation_fraction (probes with no analog within "
        f"{support['z_threshold']}z): **{support['extrapolation_fraction']}**",
        "",
        "## Decision rule (pre-registered)",
        "- **A**: some variant max_validated_p>=0.50 AND top1pct_emp>=0.50 AND monotonic AND pr_auc>1.5x base.",
        "- **B**: all variants max_validated_p<=0.35 AND top1pct_emp<=0.35.",
        "- **A-minus**: otherwise (best in 0.35-0.50).",
    ]
    path.write_text("\n".join(lines))


if __name__ == "__main__":
    b = run()
    print(f"Diagnostic complete. Branch={b}. See data/diagnostics/ceiling/report.md")
```

- [ ] **Step 4: Add `data/diagnostics/` to .gitignore**

Append to `.gitignore`:

```
# Diagnostic outputs (regenerable, not product artifacts)
data/diagnostics/
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_ceiling_diagnostic_cli.py -q`
Expected: PASS (2 tests). If `to_markdown` raises, run `python3.13 -m pip show tabulate` — `tabulate` ships with the pandas extras here; if missing, replace `summary.to_markdown(index=False)` with `summary.to_string(index=False)`.

- [ ] **Step 6: Commit**

```bash
git add scripts/run_ceiling_diagnostic.py tests/test_ceiling_diagnostic_cli.py .gitignore
git commit -m "feat(diagnostic): ceiling-sweep orchestrator + pre-registered branch verdict"
```

---

## Task 6: full-suite gate + real diagnostic run

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite (no regressions)**

Run: `python3.13 -m pytest -q`
Expected: PASS (existing 158 + new diagnostic tests).

- [ ] **Step 2: Execute the real diagnostic end-to-end**

Run: `python3.13 scripts/run_ceiling_diagnostic.py`
Expected: completes in ~10–25 min; prints `Diagnostic complete. Branch=<A|A-minus|B>.`; writes
`data/diagnostics/ceiling/summary.csv`, `report.md`, per-variant `reliability.json` + PNGs, and
`data/diagnostics/extrapolation/support_report.json`.

- [ ] **Step 3: Confirm production was untouched**

Run: `git status --porcelain data/models data/reliability`
Expected: empty output (no diffs — the diagnostic wrote nothing under production paths).

- [ ] **Step 4: Read the verdict and report back to the human**

Open `data/diagnostics/ceiling/report.md`. Report the Branch verdict, the per-variant `max_validated_p` / `top1pct_emp` / `pr_auc` table, and the `extrapolation_fraction`. **Do not** auto-proceed into Branch A or Branch B work — the human decides the strategy from this evidence.

---

## Done-when

- `python3.13 -m pytest -q` is green (existing 158 + new diagnostic/support/CLI tests).
- `python3.13 scripts/run_ceiling_diagnostic.py` produces a `report.md` with a Branch verdict, a per-variant `summary.csv`, reliability plots, and a `support_report.json`.
- `git status --porcelain data/models data/reliability` is empty after a run (read-only w.r.t. production confirmed).
- The verdict is reported to the human; **no** Branch A/B implementation is started without explicit human direction.

## Notes for the implementer

- **Interpreter:** always `python3.13` here; bare `python3` lacks xgboost/scipy/sklearn/matplotlib.
- **Read-only is the headline invariant.** The diagnostic must never call `train_transition_model` or `save_artifact`. Task 1 and Task 5 both assert this via monkeypatched guards — keep them.
- **Why duplicate the fold loop (Task 1) instead of importing the trainer?** The trainer persists artifacts as a side effect. Until/unless Branch A is greenlit, refactoring production training to extract the loop is unjustified risk (YAGNI). The ~25-line duplication is the deliberately-cheaper choice.
- **Runtime:** the real run does ~7 variants × ~104 folds × XGB fit. If it is too slow on the live panel, the grid or `min_train_days`/`test_days` can be adjusted via `run(...)`, but the committed defaults must match production walk-forward config so the ceiling numbers are comparable to the live table.
- **Interpreting the result:** a low ceiling that coincides with a high `extrapolation_fraction` is the strongest evidence for Branch B — it means the scary upper range is both unpredictable *and* unvalidatable. A low ceiling with low extrapolation_fraction but high `raw_max` vs low `cal_max` would instead point at calibrator over-compression (a narrower, cheaper fix than full C).
```
