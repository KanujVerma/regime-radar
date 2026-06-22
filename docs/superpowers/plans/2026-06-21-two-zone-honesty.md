# Two-Zone Honesty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the misleading "calibrated-looking" transition number above its validated ceiling with a backend-owned, three-state honest contract (`RiskReading`): a calibrated probability in the validated zone, an ordinal raw-score-percentile severity above it, and an explicit out-of-support trust downgrade — surfaced fully in Scenario Explorer.

**Architecture:** A version-stamped raw-score reference artifact (final model scored over all history) backs a rank-based stress percentile. Pure functions (`stress_percentile`, `stress_tier`, `classify_support`) feed a single assembler `build_risk_reading` that emits the typed `RiskReading` (display_state derived support-first from two orthogonal primitives). Both serving paths embed it; the frontend renders off `display_state` and stops re-deriving zone logic.

**Tech Stack:** Python 3.13 (`python3.13` — bare `python3` lacks deps), pandas, numpy, scikit-learn, pydantic, FastAPI; frontend React + TypeScript + vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-two-zone-honesty-design.md`

**Interpreter note:** all backend pytest runs use `python3.13 -m pytest ...`. Frontend uses `cd frontend && npx vitest run ...`.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/evaluation/stress_metrics.py` | Create | Pure: `stress_percentile`, `stress_tier`, `STRESS_TIER_CUTPOINTS` |
| `tests/test_stress_metrics.py` | Create | Unit tests for the pure stress functions |
| `src/evaluation/support_distance.py` | Modify | Add `classify_support(point, reference_df, z_threshold)` |
| `tests/test_support_distance.py` | Modify | Add test for `classify_support` |
| `scripts/build_raw_score_reference.py` | Create | Build + persist version-stamped raw-score reference artifact |
| `tests/test_raw_score_reference.py` | Create | Test reference builder (synthetic, no network) |
| `scripts/tier_histogram.py` | Create | One-shot diagnostic: tier-frequency histogram (read-only) |
| `src/api/risk_reading.py` | Create | `RiskReading` dataclass + `build_risk_reading` assembler |
| `tests/test_risk_reading.py` | Create | 2×2 precedence, analog_status, version-mismatch degrade |
| `src/api/schemas.py` | Modify | `RiskReadingModel` + `SupportInfo`; embed in current-state & scenario responses |
| `src/models/predict_live.py` | Modify | Return `transition_risk_raw` alongside calibrated |
| `src/api/state.py` | Modify | Capture raw score; load raw reference; expose helpers |
| `src/api/routes.py` | Modify | Apply calibrator in scenario; assemble + embed `RiskReading` in both endpoints |
| `tests/test_api_smoke.py` | Modify | Endpoint assertions for the three states |
| `frontend/src/types/api.ts` | Modify | `RiskReading` TS types; add to response types |
| `frontend/src/lib/riskReading.ts` | Create | **Pure view-model**: maps `RiskReading` → display fields; owns the no-`%` guarantee |
| `frontend/src/lib/riskReading.test.ts` | Create | Node-env logic tests: 3-state mapping, analog_status, **no `%` in stress view-models** |
| `frontend/src/components/RiskReadingDisplay.tsx` | Create | Thin renderer of the view-model (no logic) |
| `frontend/src/lib/reliability.ts` | Modify | Drop `MIN_N`/`out_of_range`; validated-zone formatting only |
| `frontend/src/lib/reliability.test.ts` | Modify | Single-source-of-truth regression guard |
| `frontend/src/pages/ScenarioExplorer.tsx` | Modify | Full three-state integration |
| `frontend/src/pages/CurrentState.tsx` | Modify | Drop `out_of_range` usage; contract plumbing + shared fallback only |

**Frontend testing convention:** this repo's vitest runs in `node` env with no DOM/testing-library; all 116 existing tests are pure-logic `.test.ts`. We follow that: display *logic* lives in `lib/riskReading.ts` and is fully unit-tested; `.tsx` components are thin and verified by `tsc -b` + the view-model tests. We do **not** introduce jsdom/@testing-library for this feature.

**Reference artifact path:** `data/reliability/raw_score_reference.json` (serving reference data, sits beside the reliability tables).

---

## Task 1: version-stamped raw-score reference artifact

**Files:**
- Create: `scripts/build_raw_score_reference.py`
- Test: `tests/test_raw_score_reference.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_raw_score_reference.py
import json
import numpy as np
import pandas as pd
from scripts.build_raw_score_reference import build_reference


class _StubModel:
    """predict_proba returns a deterministic monotone function of column 0."""
    def predict_proba(self, X):
        x = np.asarray(X)[:, 0].astype(float)
        p = 1 / (1 + np.exp(-x))
        return np.column_stack([1 - p, p])


def test_build_reference_sorted_and_stamped():
    feats = pd.DataFrame({"a": np.linspace(-3, 3, 200), "b": np.zeros(200)})
    ref = build_reference(model=_StubModel(), features=feats[["a", "b"]],
                          feature_names=["a", "b"], model_version="2026-06-21T00:00:00")
    assert ref["model_version"] == "2026-06-21T00:00:00"
    scores = ref["raw_scores_sorted"]
    assert len(scores) == 200
    assert scores == sorted(scores)               # ascending
    assert 0.0 <= scores[0] <= scores[-1] <= 1.0
    assert ref["n"] == 200


def test_build_reference_is_json_serializable():
    feats = pd.DataFrame({"a": np.linspace(-1, 1, 50), "b": np.zeros(50)})
    ref = build_reference(model=_StubModel(), features=feats[["a", "b"]],
                          feature_names=["a", "b"], model_version="v1")
    json.dumps(ref)  # must not raise
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_raw_score_reference.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'scripts.build_raw_score_reference'`

- [ ] **Step 3: Write minimal implementation**

```python
# scripts/build_raw_score_reference.py
"""Build the version-stamped raw-score reference for stress percentiles.

SEMANTICS (precise): the stress percentile is a statement ONLY about the serving
model's own historical output distribution — "today's raw score is higher than X%
of the raw scores THIS model has produced over history." It is NOT a market-outcome
probability and NOT a general 'severity truth'; it is the model talking about how
loud its own alarm is relative to its own past. We therefore score the full
historical feature matrix with the SAME (final) model that serves live readings and
persist the sorted raw vector, stamped with that model's version. In-sample optimism
is harmless: the percentile is a rank, invariant to monotonic inflation. (The
reliability TABLE stays OOF — different job, different reference.)
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

REFERENCE_PATH = Path(__file__).resolve().parent.parent / "data" / "reliability" / "raw_score_reference.json"


def build_reference(model, features: pd.DataFrame, feature_names: list[str],
                    model_version: str) -> dict:
    """Score `features` with `model` (raw), return a sorted-reference dict."""
    X = features[feature_names].fillna(0)
    raw = model.predict_proba(X)[:, 1].astype(float)
    raw_sorted = sorted(float(v) for v in raw)
    return {
        "model_version": model_version,
        "n": len(raw_sorted),
        "raw_scores_sorted": raw_sorted,
    }


def main() -> None:
    from src.models.registry import load_artifact, load_metadata, artifact_exists
    from src.features.build_market_features import build_features
    from src.labeling.build_regime_labels import build_regime_labels
    from src.utils.paths import PROCESSED_DIR

    if not artifact_exists("xgb_transition"):
        raise RuntimeError("xgb_transition artifact not found. Run bootstrap_data.py first.")

    model = load_artifact("xgb_transition")
    meta = load_metadata("xgb_transition")
    feature_names = meta.get("feature_names")
    model_version = meta.get("saved_at", "unknown")
    if not feature_names:
        raise RuntimeError("xgb_transition metadata missing 'feature_names'.")

    panel = pd.read_parquet(Path(PROCESSED_DIR) / "panel.parquet")
    regime = build_regime_labels(panel)
    features = build_features(panel, regime_series=regime).dropna()

    ref = build_reference(model, features, feature_names, model_version)
    REFERENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    REFERENCE_PATH.write_text(json.dumps(ref))
    print(f"Wrote {REFERENCE_PATH}: n={ref['n']} version={ref['model_version']}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_raw_score_reference.py -q`
Expected: PASS (2 tests)

- [ ] **Step 5: Build the real reference (one-shot, needed by later tasks)**

Run: `python3.13 scripts/build_raw_score_reference.py`
Expected: prints `Wrote .../raw_score_reference.json: n=<~7800> version=<ISO timestamp>`

- [ ] **Step 6: Commit**

```bash
git add scripts/build_raw_score_reference.py tests/test_raw_score_reference.py data/reliability/raw_score_reference.json
git commit -m "feat(stress): version-stamped raw-score reference for stress percentiles"
```

---

## Task 2: tier-frequency histogram sanity-check (locks cutpoints)

**Files:**
- Create: `scripts/tier_histogram.py`

**Purpose:** Print how the draft tier cutpoints (0.85 / 0.97 / 0.995) bucket the *real* raw-score distribution before they are hard-coded in Task 3. **Read-only.**

**Gate rule (automatic, narrow tripwire — not a general stop):** proceed to Task 3 with the default cutpoints UNLESS a band is *degenerate*, defined as: (a) `Extreme` (p≥0.995) captures **0** historical days, OR (b) `Elevated` (p≥0.85) captures **>40%** of all history. If either trips, STOP and report to the controller to choose adjusted cutpoints; otherwise proceed automatically with 0.85/0.97/0.995.

- [ ] **Step 1: Write the script**

```python
# scripts/tier_histogram.py
"""One-shot read-only diagnostic: how do draft stress-tier cutpoints bucket the
real raw-score reference distribution? Run before locking cutpoints in Task 3."""
from __future__ import annotations
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

DRAFT_CUTPOINTS = {"Elevated": 0.85, "High": 0.97, "Extreme": 0.995}
REFERENCE_PATH = Path(__file__).resolve().parent.parent / "data" / "reliability" / "raw_score_reference.json"


def main() -> None:
    ref = json.loads(REFERENCE_PATH.read_text())
    scores = np.asarray(ref["raw_scores_sorted"], dtype=float)
    n = len(scores)
    print(f"reference n={n} version={ref['model_version']}")
    print(f"raw score range: [{scores.min():.4f}, {scores.max():.4f}]")
    # For each draft cutpoint (a percentile), show the raw-score threshold and how
    # many historical days land in each tier band.
    qs = sorted(DRAFT_CUTPOINTS.items(), key=lambda kv: kv[1])
    edges = [(name, q, float(np.quantile(scores, q))) for name, q in qs]
    print("\ndraft cutpoints (percentile -> raw threshold):")
    for name, q, thr in edges:
        n_at_or_above = int((scores >= thr).sum())
        print(f"  {name:9s} p>={q:.3f}  raw>={thr:.4f}  days_at_or_above={n_at_or_above} "
              f"({100*n_at_or_above/n:.2f}%)")
    print("\nInterpretation: 'Extreme' should be rare (tens of the most alarming days "
          "in ~30y). If a band is empty or implausibly large, adjust cutpoints in Task 3.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it and report output to the controller**

Run: `python3.13 scripts/tier_histogram.py`
Expected: prints per-tier raw thresholds and day counts. **The controller reviews this and confirms the cutpoints for Task 3** (default: keep 0.85 / 0.97 / 0.995 unless a band is degenerate).

- [ ] **Step 3: Commit**

```bash
git add scripts/tier_histogram.py
git commit -m "chore(stress): tier-frequency histogram diagnostic for cutpoint review"
```

---

## Task 3: stress percentile + tier (pure functions)

**Files:**
- Create: `src/evaluation/stress_metrics.py`
- Test: `tests/test_stress_metrics.py`

> **Cutpoints:** use the values confirmed by Task 2 (default `0.85 / 0.97 / 0.995`). If Task 2 led the controller to change them, substitute the confirmed numbers in `STRESS_TIER_CUTPOINTS` and the test below.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_stress_metrics.py
import numpy as np
import pytest
from src.evaluation.stress_metrics import stress_percentile, stress_tier, STRESS_TIER_CUTPOINTS


def test_percentile_is_fraction_at_or_below():
    ref = sorted(np.linspace(0.0, 1.0, 1001))  # 0.000 .. 1.000
    # 0.50 sits at the midpoint -> ~0.5 percentile
    assert stress_percentile(0.50, ref) == pytest.approx(0.5, abs=0.01)
    # below the floor -> ~0, above the ceiling -> 1.0
    assert stress_percentile(-1.0, ref) == pytest.approx(0.0, abs=1e-6)
    assert stress_percentile(2.0, ref) == 1.0


def test_percentile_rank_preserving():
    ref = sorted(np.random.default_rng(0).uniform(size=500))
    assert stress_percentile(0.9, ref) >= stress_percentile(0.4, ref)


def test_percentile_empty_reference_returns_none():
    assert stress_percentile(0.5, []) is None


def test_tier_bands():
    # Defaults: >=0.85 Elevated, >=0.97 High, >=0.995 Extreme; below 0.85 -> None
    assert stress_tier(0.80) is None
    assert stress_tier(0.85) == "Elevated"
    assert stress_tier(0.96) == "Elevated"
    assert stress_tier(0.97) == "High"
    assert stress_tier(0.994) == "High"
    assert stress_tier(0.995) == "Extreme"
    assert stress_tier(1.0) == "Extreme"
    assert stress_tier(None) is None


def test_cutpoints_are_ordered():
    vals = [STRESS_TIER_CUTPOINTS[k] for k in ("Elevated", "High", "Extreme")]
    assert vals == sorted(vals)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_stress_metrics.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.evaluation.stress_metrics'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/evaluation/stress_metrics.py
"""Pure stress-zone metrics: rank-based percentile + fixed ordinal tiers.

stress_percentile ranks a RAW transition score against the SERVING MODEL'S OWN
historical raw-score distribution (a fraction in [0,1]) — i.e. "louder than X% of
this model's past readings." It is NOT a probability and NOT a market-outcome claim.
stress_tier maps that percentile to an ordinal severity label using FIXED cutpoints
(stable across retrains; the percentile transform already supplies distribution-
relativity). Both are ordinal severity descriptors only.
"""
from __future__ import annotations
import bisect

# Fixed percentile cutpoints (see spec + Task 2 histogram). Ordinal only.
STRESS_TIER_CUTPOINTS = {"Elevated": 0.85, "High": 0.97, "Extreme": 0.995}


def stress_percentile(raw_score: float, raw_reference_sorted) -> float | None:
    """Fraction of the sorted reference at or below `raw_score`. None if no reference."""
    ref = raw_reference_sorted
    n = len(ref)
    if n == 0:
        return None
    # number of reference points <= raw_score, divided by n
    count = bisect.bisect_right(ref, raw_score)
    return count / n


def stress_tier(percentile: float | None) -> str | None:
    """Map a stress percentile to an ordinal tier, or None below the lowest band."""
    if percentile is None:
        return None
    if percentile >= STRESS_TIER_CUTPOINTS["Extreme"]:
        return "Extreme"
    if percentile >= STRESS_TIER_CUTPOINTS["High"]:
        return "High"
    if percentile >= STRESS_TIER_CUTPOINTS["Elevated"]:
        return "Elevated"
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_stress_metrics.py -q`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/evaluation/stress_metrics.py tests/test_stress_metrics.py
git commit -m "feat(stress): rank-based stress_percentile + fixed-band stress_tier"
```

---

## Task 4: per-reading support classification

**Files:**
- Modify: `src/evaluation/support_distance.py`
- Test: `tests/test_support_distance.py`

- [ ] **Step 1: Write the failing test (append)**

```python
# tests/test_support_distance.py  (append)
from src.evaluation.support_distance import classify_support


def test_classify_support_in_distribution_point_is_supported():
    ref = _ref()  # existing helper in this test file (6 SCENARIO_BASELINE_FEATURES)
    point = ref.iloc[10].to_dict()
    in_support, dist = classify_support(point, ref, z_threshold=3.0)
    assert in_support is True
    assert dist < 1e-6


def test_classify_support_extreme_point_is_unsupported():
    ref = _ref()
    point = (ref.mean() + 50 * ref.std()).to_dict()
    in_support, dist = classify_support(point, ref, z_threshold=3.0)
    assert in_support is False
    assert dist > 10
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_support_distance.py -k classify_support -q`
Expected: FAIL — `ImportError: cannot import name 'classify_support'`

- [ ] **Step 3: Write minimal implementation (append)**

```python
# src/evaluation/support_distance.py  (append)
def classify_support(point: dict, reference: "pd.DataFrame", z_threshold: float = 3.0) -> tuple[bool, float]:
    """Classify a single condition vector against the historical reference.

    Standardizes `point` and `reference` over the shared SCENARIO_BASELINE_FEATURES
    columns, then returns (in_support, nn_z_distance) where in_support is
    nn_z_distance <= z_threshold.
    """
    import pandas as pd
    cols = [c for c in SCENARIO_BASELINE_FEATURES if c in reference.columns and c in point]
    ref = reference[cols].dropna()
    mean, std = standardize_reference(ref)
    z_ref = ((ref - mean) / std).to_numpy()
    p = pd.Series({c: float(point[c]) for c in cols})
    dist = nn_distance((p - mean) / std, z_ref)
    return (dist <= z_threshold, dist)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_support_distance.py -k classify_support -q`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/evaluation/support_distance.py tests/test_support_distance.py
git commit -m "feat(stress): classify_support for a single condition vector"
```

---

## Task 5: RiskReading assembler

**Files:**
- Create: `src/api/risk_reading.py`
- Test: `tests/test_risk_reading.py`

This is the core. `build_risk_reading` takes the two scores + condition vector + a loaded reference, derives `display_state` **support-first**, computes `analog_status`, and degrades to validated-only on a version mismatch.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_risk_reading.py
import numpy as np
import pandas as pd
import pytest
from src.api.risk_reading import build_risk_reading, RiskReading

REF = {"model_version": "v1", "n": 1000,
       "raw_scores_sorted": sorted(np.linspace(0.0, 1.0, 1000))}
# 6-feature historical condition reference (in-distribution around 0)
COND_REF = pd.DataFrame(
    np.random.default_rng(0).normal(size=(300, 6)),
    columns=["vix_level", "vix_chg_5d", "rv_20d_pct", "drawdown_pct_504d", "ret_20d", "dist_sma50"],
)
IN_SUPPORT_POINT = COND_REF.iloc[5].to_dict()
OUT_SUPPORT_POINT = (COND_REF.mean() + 60 * COND_REF.std()).to_dict()

MAXP = 0.30


def _call(calibrated_p, raw_score, point, analogs=None, applicable=True):
    return build_risk_reading(
        calibrated_p=calibrated_p, raw_score=raw_score, condition_point=point,
        cond_reference=COND_REF, raw_reference=REF, model_version="v1",
        max_evaluated_p=MAXP, find_analogs_fn=(lambda: analogs if analogs is not None else []),
        analogs_applicable=applicable, z_threshold=3.0,
    )


def test_validated_state_in_support_low_p():
    r = _call(calibrated_p=0.12, raw_score=0.4, point=IN_SUPPORT_POINT)
    assert r.display_state == "validated"
    assert r.validated_probability == 0.12
    assert r.stress_percentile is None and r.stress_tier is None
    assert r.analog_status == "not_applicable" and r.nearest_analogs is None
    assert r.support.in_support is True


def test_stress_in_support_high_p():
    r = _call(calibrated_p=0.55, raw_score=0.98, point=IN_SUPPORT_POINT,
              analogs=[{"label": "Mar 2020", "date": "2020-03-16", "raw_score": 0.97}])
    assert r.display_state == "stress_in_support"
    assert r.validated_probability is None
    assert r.stress_percentile is not None and r.stress_tier == "Extreme"
    assert r.analog_status == "available" and len(r.nearest_analogs) == 1


def test_stress_in_support_but_no_analogs_is_unavailable():
    r = _call(calibrated_p=0.55, raw_score=0.98, point=IN_SUPPORT_POINT, analogs=[])
    assert r.display_state == "stress_in_support"
    assert r.analog_status == "unavailable" and r.nearest_analogs is None


def test_scenario_hypothetical_analogs_not_applicable():
    # analogs_applicable=False (scenario hypothetical): not_applicable, NOT unavailable.
    r = _call(calibrated_p=0.55, raw_score=0.98, point=IN_SUPPORT_POINT, applicable=False)
    assert r.display_state == "stress_in_support"
    assert r.analog_status == "not_applicable" and r.nearest_analogs is None


def test_out_of_support_dominates_even_with_high_p():
    r = _call(calibrated_p=0.55, raw_score=0.98, point=OUT_SUPPORT_POINT)
    assert r.display_state == "stress_out_of_support"
    assert r.validated_probability is None
    assert r.analog_status == "not_applicable" and r.nearest_analogs is None
    assert r.support.in_support is False


def test_out_of_support_dominates_even_with_low_p():
    # The hidden 4th cell: unusual inputs that net to a calm score.
    r = _call(calibrated_p=0.10, raw_score=0.2, point=OUT_SUPPORT_POINT)
    assert r.display_state == "stress_out_of_support"
    assert r.validated_probability is None
    assert r.stress_percentile is not None  # still ranked, just low


def test_boundary_p_equals_max_is_validated():
    r = _call(calibrated_p=MAXP, raw_score=0.5, point=IN_SUPPORT_POINT)
    assert r.display_state == "validated"


def test_version_mismatch_suppresses_percentile_but_keeps_validated_in_support():
    # In-support + version mismatch: can't rank severity -> fall back to validated.
    r = build_risk_reading(
        calibrated_p=0.55, raw_score=0.98, condition_point=IN_SUPPORT_POINT,
        cond_reference=COND_REF, raw_reference=REF, model_version="DIFFERENT",
        max_evaluated_p=MAXP, find_analogs_fn=lambda: [], z_threshold=3.0,
    )
    assert r.display_state == "validated"
    assert r.validated_probability == 0.55      # falls back to showing calibrated p
    assert r.stress_percentile is None and r.stress_tier is None


def test_version_mismatch_still_flags_out_of_support():
    # Support is independent of the model version, so out-of-support MUST survive a
    # mismatch (never show a 'validated' number for an off-the-map input).
    r = build_risk_reading(
        calibrated_p=0.55, raw_score=0.98, condition_point=OUT_SUPPORT_POINT,
        cond_reference=COND_REF, raw_reference=REF, model_version="DIFFERENT",
        max_evaluated_p=MAXP, find_analogs_fn=lambda: [], z_threshold=3.0,
    )
    assert r.display_state == "stress_out_of_support"
    assert r.validated_probability is None
    assert r.stress_percentile is None and r.stress_tier is None  # ranking suppressed
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_risk_reading.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.api.risk_reading'`

- [ ] **Step 3: Write minimal implementation**

```python
# src/api/risk_reading.py
"""Assemble the typed RiskReading honesty contract.

Two orthogonal primitives -> one derived display_state (support evaluated first):
  not in_support              -> stress_out_of_support
  in_support, p > ceiling     -> stress_in_support
  in_support, p <= ceiling    -> validated

Version guard: the stress PERCENTILE is only valid against a reference produced by
the SAME model that serves live readings. On a version mismatch we suppress the
percentile/tier (set to None) and log loudly — but support classification does NOT
depend on the model version (it is computed from condition vectors), so
stress_out_of_support is STILL honored on a mismatch. An in-support reading that
can no longer be ranked falls back to validated (show the honest calibrated p).

analogs_applicable: scenario hypotheticals have no live query-date, so analogs are
'not_applicable' there (distinct from 'unavailable' = applicable but none found).
"""
from __future__ import annotations
import logging
from dataclasses import dataclass

import pandas as pd

from src.evaluation.stress_metrics import stress_percentile, stress_tier
from src.evaluation.support_distance import classify_support

_logger = logging.getLogger(__name__)


@dataclass
class SupportInfo:
    in_support: bool
    nn_z_distance: float


@dataclass
class RiskReading:
    display_state: str                    # validated | stress_in_support | stress_out_of_support
    validated_probability: float | None
    stress_percentile: float | None
    stress_tier: str | None
    analog_status: str                    # not_applicable | available | unavailable
    nearest_analogs: list | None
    support: SupportInfo
    max_evaluated_p: float


def _validated_only(calibrated_p, max_evaluated_p, support) -> RiskReading:
    return RiskReading(
        display_state="validated",
        validated_probability=round(float(calibrated_p), 4),
        stress_percentile=None, stress_tier=None,
        analog_status="not_applicable", nearest_analogs=None,
        support=support, max_evaluated_p=max_evaluated_p,
    )


def build_risk_reading(*, calibrated_p: float, raw_score: float, condition_point: dict,
                       cond_reference: pd.DataFrame, raw_reference: dict, model_version: str,
                       max_evaluated_p: float, find_analogs_fn, analogs_applicable: bool = True,
                       z_threshold: float = 3.0) -> RiskReading:
    in_support, nn_dist = classify_support(condition_point, cond_reference, z_threshold)
    support = SupportInfo(in_support=bool(in_support), nn_z_distance=round(float(nn_dist), 4))

    # Version guard: the percentile is only meaningful against the serving model's own
    # reference. On mismatch, suppress percentile/tier (loudly) — but support is
    # model-version-independent, so out_of_support is still honored below.
    version_ok = raw_reference.get("model_version") == model_version
    if not version_ok:
        _logger.warning(
            "RAW-SCORE REFERENCE VERSION MISMATCH: reference=%s serving_model=%s — "
            "severity percentile suppressed; rebuild data/reliability/raw_score_reference.json",
            raw_reference.get("model_version"), model_version,
        )

    pct = stress_percentile(float(raw_score), raw_reference.get("raw_scores_sorted", [])) if version_ok else None
    tier = stress_tier(pct) if version_ok else None

    # Derive display_state, support FIRST. stress_in_support requires a usable ranking
    # (version_ok); otherwise an in-support above-ceiling reading falls back to validated.
    if not in_support:
        display_state = "stress_out_of_support"
    elif version_ok and float(calibrated_p) > max_evaluated_p:
        display_state = "stress_in_support"
    else:
        display_state = "validated"

    if display_state == "validated":
        return _validated_only(calibrated_p, max_evaluated_p, support)

    # Stress states: no calibrated probability shown.
    if display_state == "stress_in_support":
        if not analogs_applicable:
            analog_status, nearest = "not_applicable", None
        else:
            analogs = find_analogs_fn() or []
            if analogs:
                analog_status, nearest = "available", analogs
            else:
                analog_status, nearest = "unavailable", None
    else:  # stress_out_of_support
        analog_status, nearest = "not_applicable", None

    return RiskReading(
        display_state=display_state,
        validated_probability=None,
        stress_percentile=round(pct, 4) if pct is not None else None,
        stress_tier=tier,
        analog_status=analog_status,
        nearest_analogs=nearest,
        support=support,
        max_evaluated_p=max_evaluated_p,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_risk_reading.py -q`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/risk_reading.py tests/test_risk_reading.py
git commit -m "feat(api): build_risk_reading assembler (3-state, support-first, version-guarded)"
```

---

## Task 6: Pydantic schema for RiskReading

**Files:**
- Modify: `src/api/schemas.py`
- Test: `tests/test_risk_reading.py` (append a serialization test)

- [ ] **Step 1: Write the failing test (append)**

```python
# tests/test_risk_reading.py  (append)
from src.api.schemas import RiskReadingModel
from src.api.risk_reading import RiskReading, SupportInfo


def test_risk_reading_model_from_dataclass():
    rr = RiskReading(
        display_state="stress_out_of_support", validated_probability=None,
        stress_percentile=0.991, stress_tier="High", analog_status="not_applicable",
        nearest_analogs=None, support=SupportInfo(in_support=False, nn_z_distance=14.2),
        max_evaluated_p=0.30,
    )
    m = RiskReadingModel.from_reading(rr)
    assert m.display_state == "stress_out_of_support"
    assert m.support.in_support is False
    assert m.validated_probability is None
    assert m.model_dump()["stress_tier"] == "High"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_risk_reading.py -k risk_reading_model -q`
Expected: FAIL — `ImportError: cannot import name 'RiskReadingModel'`

- [ ] **Step 3: Write minimal implementation (append to `src/api/schemas.py`)**

```python
# src/api/schemas.py  (append, after imports already present at top)


class SupportInfoModel(BaseModel):
    in_support: bool
    nn_z_distance: float


class RiskReadingAnalog(BaseModel):
    label: str
    date: str
    raw_score: float


class RiskReadingModel(BaseModel):
    display_state: Literal["validated", "stress_in_support", "stress_out_of_support"]
    validated_probability: float | None = None
    stress_percentile: float | None = None
    stress_tier: Literal["Elevated", "High", "Extreme"] | None = None
    analog_status: Literal["not_applicable", "available", "unavailable"] = "not_applicable"
    nearest_analogs: list[RiskReadingAnalog] | None = None
    support: SupportInfoModel
    max_evaluated_p: float

    @classmethod
    def from_reading(cls, rr) -> "RiskReadingModel":
        return cls(
            display_state=rr.display_state,
            validated_probability=rr.validated_probability,
            stress_percentile=rr.stress_percentile,
            stress_tier=rr.stress_tier,
            analog_status=rr.analog_status,
            nearest_analogs=(
                [RiskReadingAnalog(**a) for a in rr.nearest_analogs]
                if rr.nearest_analogs else None
            ),
            support=SupportInfoModel(in_support=rr.support.in_support,
                                     nn_z_distance=rr.support.nn_z_distance),
            max_evaluated_p=rr.max_evaluated_p,
        )
```

- [ ] **Step 4: Embed the optional field in the two response models**

In `src/api/schemas.py`, add to `CurrentStateResponse` (after `condition_values`):

```python
    risk_reading: RiskReadingModel | None = None
```

and to `ScenarioResponse` (after `baseline_inputs`):

```python
    risk_reading: RiskReadingModel | None = None
```

(Optional + default `None` keeps every existing test green; the field is populated in Tasks 7–8.)

- [ ] **Step 5: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_risk_reading.py -k risk_reading_model -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/schemas.py tests/test_risk_reading.py
git commit -m "feat(api): RiskReadingModel pydantic schema + optional response field"
```

---

## Task 7: wire RiskReading into the scenario endpoint

**Files:**
- Modify: `src/api/routes.py` (scenario handler, around lines 527–600)
- Modify: `src/api/state.py` (expose a loaded raw reference + cond reference helper)
- Test: `tests/test_api_smoke.py`

**Context:** scenario currently computes `scenario_risk = transition_model.predict_proba(X_scen)[0,1]` (RAW, no calibrator). We add calibration to get the calibrated p, keep the raw for the percentile, and assemble a `RiskReading`.

- [ ] **Step 1: Write the failing test (append to `tests/test_api_smoke.py`)**

```python
# tests/test_api_smoke.py  (append)
def test_scenario_maxed_sliders_returns_out_of_support(client):
    # Absurd inputs -> out-of-support, no calibrated probability, no fabricated percent.
    body = {"vix_level": 200.0, "vix_chg_5d": 50.0, "rv_20d_pct": 5.0,
            "drawdown_pct_504d": -0.95, "ret_20d": -0.9, "dist_sma50": -0.9}
    r = client.post("/scenario", json=body)
    assert r.status_code == 200
    rr = r.json().get("risk_reading")
    assert rr is not None
    assert rr["display_state"] == "stress_out_of_support"
    assert rr["validated_probability"] is None
    assert rr["support"]["in_support"] is False


def test_scenario_baseline_like_inputs_have_risk_reading(client):
    # A mild, in-distribution scenario should carry a risk_reading (state may vary).
    body = {"vix_level": 16.0, "vix_chg_5d": 0.0, "rv_20d_pct": 0.12,
            "drawdown_pct_504d": -0.03, "ret_20d": 0.01, "dist_sma50": 0.01}
    r = client.post("/scenario", json=body)
    assert r.status_code == 200
    assert r.json()["risk_reading"] is not None


def test_scenario_version_mismatch_degrades_at_endpoint(client, monkeypatch):
    # Endpoint-level guard: a reference whose version != serving model must NOT yield
    # a stress percentile. We force a mismatch via the state helper and assert the
    # in-support reading degrades (no stress_in_support, no fabricated percentile).
    import src.api.state as state_mod
    app_state = client.app.state.app_state if hasattr(client.app.state, "app_state") else None
    # Force load_risk_reading_context to return a mismatched reference.
    def _mismatched(self):
        raw_ref, cond_ref, _ver, max_p = AppState_orig(self)
        if raw_ref is not None:
            raw_ref = {**raw_ref, "model_version": "STALE_VERSION"}
        return raw_ref, cond_ref, "CURRENT_VERSION", max_p
    AppState_orig = state_mod.AppState.load_risk_reading_context
    monkeypatch.setattr(state_mod.AppState, "load_risk_reading_context", _mismatched)
    body = {"vix_level": 16.0, "vix_chg_5d": 0.0, "rv_20d_pct": 0.12,
            "drawdown_pct_504d": -0.03, "ret_20d": 0.01, "dist_sma50": 0.01}
    r = client.post("/scenario", json=body)
    assert r.status_code == 200
    rr = r.json()["risk_reading"]
    if rr is not None:
        assert rr["stress_percentile"] is None  # ranking suppressed on mismatch
```

> **Note:** adapt the monkeypatch wiring to however the test suite accesses `AppState` (read the top of `tests/test_api_smoke.py` for the existing app/state fixture). The assertion that matters: on a forced version mismatch the endpoint never returns a `stress_percentile`.

> If the existing `tests/test_api_smoke.py` uses a different fixture name than `client`, match it (read the top of the file first).

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_api_smoke.py -k scenario_maxed -q`
Expected: FAIL — `risk_reading` is `None` (field exists but unpopulated).

- [ ] **Step 3a: Add a reference loader to `src/api/state.py`**

Add a method to `AppState` (near the other artifact loads):

```python
    def load_risk_reading_context(self):
        """Return (raw_reference dict|None, cond_reference DataFrame|None, model_version, max_evaluated_p).

        Read lazily; safe to call per-request. Returns Nones if artifacts are absent
        so callers can skip the risk_reading rather than error.
        """
        import json as _json
        import pandas as _pd
        from pathlib import Path as _Path
        from src.models.registry import load_metadata, artifact_exists
        from src.utils.paths import PROCESSED_DIR
        from src.features.build_market_features import build_features
        from src.labeling.build_regime_labels import build_regime_labels

        ref_path = _Path(__file__).resolve().parent.parent.parent / "data" / "reliability" / "raw_score_reference.json"
        rel_path = _Path(__file__).resolve().parent.parent.parent / "data" / "reliability" / "transition_reliability_oof.json"
        if not (ref_path.exists() and artifact_exists("xgb_transition")):
            return None, None, None, 0.30
        raw_reference = _json.loads(ref_path.read_text())
        model_version = load_metadata("xgb_transition").get("saved_at", "unknown")
        max_evaluated_p = 0.30
        if rel_path.exists():
            max_evaluated_p = float(_json.loads(rel_path.read_text()).get("max_evaluated_p", 0.30))
        panel = _pd.read_parquet(_Path(PROCESSED_DIR) / "panel.parquet")
        regime = build_regime_labels(panel)
        cond_reference = build_features(panel, regime_series=regime).dropna()
        return raw_reference, cond_reference, model_version, max_evaluated_p
```

- [ ] **Step 3b: Assemble the reading in the scenario handler (`src/api/routes.py`)**

Just after `scenario_risk = float(transition_model.predict_proba(X_scen)[0, 1])` (line ~589), insert:

```python
    # Calibrated probability for the scenario (the validated-zone value + ceiling test).
    from src.models.registry import artifact_exists as _ae, load_artifact as _la
    from src.evaluation.calibration import apply_calibrator as _apply
    scenario_cal = scenario_risk
    if _ae("xgb_transition_calibrator"):
        _cal = _la("xgb_transition_calibrator")
        scenario_cal = float(_apply(_cal, [scenario_risk])[0])

    risk_reading_model = None
    try:
        raw_ref, cond_ref, model_version, max_p = app_state.load_risk_reading_context()
        if raw_ref is not None:
            from src.api.risk_reading import build_risk_reading
            from src.api.schemas import RiskReadingModel
            from src.models.analogs import find_analogs as _find
            condition_point = {k: overrides[k] for k in overrides}
            rr = build_risk_reading(
                calibrated_p=scenario_cal, raw_score=scenario_risk,
                condition_point=condition_point, cond_reference=cond_ref,
                raw_reference=raw_ref, model_version=model_version,
                max_evaluated_p=max_p,
                find_analogs_fn=lambda: [],
                analogs_applicable=False,  # hypothetical scenario -> analogs not_applicable (not 'unavailable')
            )
            risk_reading_model = RiskReadingModel.from_reading(rr)
    except Exception as e:
        import logging as _lg
        _lg.getLogger(__name__).warning("scenario risk_reading failed: %s", e)
        risk_reading_model = None
```

Then add `risk_reading=risk_reading_model` to the `ScenarioResponse(...)` constructor return.

> **Analogs in scenario:** scenario inputs are synthetic (not a historical date), so `find_analogs` over a query *date* doesn't apply; pass `lambda: []`. The reading will be `unavailable` if it lands in `stress_in_support` — correct, since there is no live-date analog for a hypothetical. (Live-date analogs are surfaced in the current-state path, Task 8.)

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_api_smoke.py -k "scenario_maxed or scenario_baseline_like" -q`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/routes.py src/api/state.py tests/test_api_smoke.py
git commit -m "feat(api): scenario endpoint emits RiskReading (calibrated p + raw percentile + support)"
```

---

## Task 8: wire RiskReading into the current-state endpoint

**Files:**
- Modify: `src/models/predict_live.py` (return raw alongside calibrated)
- Modify: `src/api/state.py` (capture raw in state dict)
- Modify: `src/api/routes.py` (current-state handler: assemble reading with live-date analogs)
- Test: `tests/test_api_smoke.py`

- [ ] **Step 1: Write the failing test (append)**

```python
# tests/test_api_smoke.py  (append)
def test_current_state_has_risk_reading(client):
    r = client.get("/current-state")
    assert r.status_code == 200
    rr = r.json().get("risk_reading")
    assert rr is not None
    assert rr["display_state"] in ("validated", "stress_in_support", "stress_out_of_support")
    # Live readings are validated on essentially every real day.
    if rr["display_state"] == "validated":
        assert rr["validated_probability"] is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3.13 -m pytest tests/test_api_smoke.py -k current_state_has_risk_reading -q`
Expected: FAIL — `risk_reading` is `None`.

- [ ] **Step 3a: Surface the raw score from `predict_current_state` (`src/models/predict_live.py`)**

The function already computes `transition_raw` and `transition_cal` (lines ~48–52). Add the latest raw value to its return dict:

```python
        "transition_risk_raw": round(float(transition_raw[-1]), 4),
```

(Place beside the existing `"transition_risk": round(latest_risk, 4),` entry.)

- [ ] **Step 3b: Capture it in the state dict (`src/api/state.py`, in `refresh`, the `state = {...}` block ~line 271)**

Add:

```python
            "transition_risk_raw": result.get("transition_risk_raw"),
```

- [ ] **Step 3c: Assemble the reading in the current-state handler (`src/api/routes.py`)**

In the `/current-state` handler, after `latest` is read and before constructing `CurrentStateResponse`, insert:

```python
    risk_reading_model = None
    try:
        raw_ref, cond_ref, model_version, max_p = app_state.load_risk_reading_context()
        raw_score = latest.get("transition_risk_raw")
        if raw_ref is not None and raw_score is not None and app_state._latest_features is not None:
            from src.api.risk_reading import build_risk_reading
            from src.api.schemas import RiskReadingModel
            from src.api.condition_features import SCENARIO_BASELINE_FEATURES
            from src.models.analogs import find_analogs as _find
            feats = app_state._latest_features
            condition_point = {c: float(feats[c]) for c in SCENARIO_BASELINE_FEATURES if c in feats.index}

            def _live_analogs():
                if app_state._analog_index is None or app_state._latest_date is None:
                    return []
                res = _find(query_date=app_state._latest_date,
                            query_features=app_state._latest_features,
                            index=app_state._analog_index)
                # NOTE: find_analogs' "transition_risk" is the analog day's CALIBRATED
                # OOF risk, not a raw score. We carry it only to back the label text;
                # the frontend renders a.label, never this number as a probability.
                return [{"label": a.get("display_date", ""), "date": a.get("full_date", ""),
                         "raw_score": float(a.get("transition_risk", 0.0))} for a in res[:3]]

            rr = build_risk_reading(
                calibrated_p=float(latest.get("transition_risk") or 0.0),
                raw_score=float(raw_score), condition_point=condition_point,
                cond_reference=cond_ref, raw_reference=raw_ref, model_version=model_version,
                max_evaluated_p=max_p, find_analogs_fn=_live_analogs,
            )
            risk_reading_model = RiskReadingModel.from_reading(rr)
    except Exception as e:
        import logging as _lg
        _lg.getLogger(__name__).warning("current-state risk_reading failed: %s", e)
        risk_reading_model = None
```

Add `risk_reading=risk_reading_model` to the `CurrentStateResponse(...)` return.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3.13 -m pytest tests/test_api_smoke.py -k current_state_has_risk_reading -q`
Expected: PASS

- [ ] **Step 5: Run the full backend suite (no regressions)**

Run: `python3.13 -m pytest -q`
Expected: PASS (all prior + new).

- [ ] **Step 6: Commit**

```bash
git add src/models/predict_live.py src/api/state.py src/api/routes.py tests/test_api_smoke.py
git commit -m "feat(api): current-state endpoint emits RiskReading with live-date analogs"
```

---

## Task 9: frontend RiskReading types

**Files:**
- Modify: `frontend/src/types/api.ts`

- [ ] **Step 1: Add the types**

```typescript
// frontend/src/types/api.ts  (append)
export type RiskDisplayState = 'validated' | 'stress_in_support' | 'stress_out_of_support'
export type StressTier = 'Elevated' | 'High' | 'Extreme'
export type AnalogStatus = 'not_applicable' | 'available' | 'unavailable'

export interface RiskReadingAnalog {
  label: string
  date: string
  raw_score: number
}

export interface RiskReading {
  display_state: RiskDisplayState
  validated_probability: number | null
  stress_percentile: number | null
  stress_tier: StressTier | null
  analog_status: AnalogStatus
  nearest_analogs: RiskReadingAnalog[] | null
  support: { in_support: boolean; nn_z_distance: number }
  max_evaluated_p: number
}
```

- [ ] **Step 2: Add `risk_reading` to the relevant response interfaces**

Find `CurrentStateResponse` and `ScenarioResponse` in `frontend/src/types/api.ts` and add:

```typescript
  risk_reading?: RiskReading | null
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: clean (no errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/api.ts
git commit -m "feat(fe): RiskReading contract types"
```

---

## Task 10: pure view-model lib (owns the no-`%` guarantee)

**Files:**
- Create: `frontend/src/lib/riskReading.ts`
- Create: `frontend/src/lib/riskReading.test.ts`

All display *logic* lives here as a pure function (node-env testable, matching the repo's convention). The `.tsx` component (Task 11) only renders this view-model.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/lib/riskReading.test.ts
import { describe, test, expect } from 'vitest'
import { riskReadingView } from './riskReading'
import type { RiskReading } from '../types/api'

const base: Omit<RiskReading, 'display_state'> = {
  validated_probability: null, stress_percentile: null, stress_tier: null,
  analog_status: 'not_applicable', nearest_analogs: null,
  support: { in_support: true, nn_z_distance: 1.0 }, max_evaluated_p: 0.30,
}

function noPercent(v: { lines: string[]; value: string | null }) {
  const all = [v.value ?? '', ...v.lines].join(' ')
  expect(all).not.toMatch(/\d%/)
}

test('validated: showsPercent true, value is a percent', () => {
  const v = riskReadingView({ ...base, display_state: 'validated', validated_probability: 0.18 })
  expect(v.kind).toBe('validated')
  expect(v.showsPercent).toBe(true)
  expect(v.value).toMatch(/18%/)
})

test('stress_in_support with analogs: tier + analog line, NO percent', () => {
  const v = riskReadingView({
    ...base, display_state: 'stress_in_support', stress_percentile: 0.98, stress_tier: 'Extreme',
    analog_status: 'available', nearest_analogs: [{ label: 'Mar 2020', date: '2020-03-16', raw_score: 0.97 }],
  })
  expect(v.kind).toBe('stress_in_support')
  expect(v.showsPercent).toBe(false)
  expect(v.tier).toBe('Extreme')
  expect(v.lines.join(' ')).toMatch(/Mar 2020/)
  expect(v.lines.join(' ')).toMatch(/ranks severity, not odds/)
  noPercent(v)
})

test('stress_in_support unavailable analogs: no analog line, still no percent', () => {
  const v = riskReadingView({
    ...base, display_state: 'stress_in_support', stress_percentile: 0.9, stress_tier: 'Elevated',
    analog_status: 'unavailable', nearest_analogs: null,
  })
  expect(v.tier).toBe('Elevated')
  expect(v.lines.join(' ')).not.toMatch(/last seen in/)
  noPercent(v)
})

test('stress_out_of_support: no-analog headline, NO percent, severity != trust', () => {
  const v = riskReadingView({
    ...base, display_state: 'stress_out_of_support', stress_percentile: 0.99, stress_tier: 'High',
    support: { in_support: false, nn_z_distance: 14.2 },
  })
  expect(v.kind).toBe('stress_out_of_support')
  expect(v.showsPercent).toBe(false)
  expect(v.lines.join(' ')).toMatch(/no historical analog/i)
  expect(v.lines.join(' ')).toMatch(/14\.2σ/)
  noPercent(v)
})

test('out-of-support with LOW percentile still renders out-of-support (4th cell)', () => {
  const v = riskReadingView({
    ...base, display_state: 'stress_out_of_support', stress_percentile: 0.12, stress_tier: null,
    support: { in_support: false, nn_z_distance: 9.0 },
  })
  expect(v.kind).toBe('stress_out_of_support')
  expect(v.showsPercent).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/riskReading.test.ts`
Expected: FAIL — cannot find module `./riskReading`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// frontend/src/lib/riskReading.ts
import type { RiskReading } from '../types/api'

export interface RiskReadingView {
  kind: 'validated' | 'stress_in_support' | 'stress_out_of_support'
  showsPercent: boolean
  value: string | null     // the calibrated percent string, validated only
  tier: string | null
  lines: string[]          // human copy; NEVER contains a probability percent in stress states
}

/** Pure mapping from the backend contract to display fields. Owns the invariant
 *  that no probability-looking percent appears above the validated range. */
export function riskReadingView(r: RiskReading): RiskReadingView {
  if (r.display_state === 'validated') {
    const pct = Math.round((r.validated_probability ?? 0) * 100)
    return { kind: 'validated', showsPercent: true, value: `${pct}%`, tier: null, lines: [] }
  }

  const pctMoreExtreme = r.stress_percentile != null ? Math.round(r.stress_percentile * 100) : null
  const severityNote = pctMoreExtreme != null
    ? [`Louder than ${pctMoreExtreme} of 100 historical model readings — ranks severity, not odds.`]
    : []

  if (r.display_state === 'stress_in_support') {
    const analogLine = (r.analog_status === 'available' && r.nearest_analogs && r.nearest_analogs.length)
      ? [`Model alarm at a level last seen in ${r.nearest_analogs.map(a => a.label).join(', ')}.`]
      : []
    return {
      kind: 'stress_in_support', showsPercent: false, value: null,
      tier: r.stress_tier, lines: [...analogLine, ...severityNote],
    }
  }

  // stress_out_of_support — severity present, trust downgraded (not "max severity")
  const z = r.support.nn_z_distance
  return {
    kind: 'stress_out_of_support', showsPercent: false, value: null, tier: r.stress_tier,
    lines: [
      `No historical analog — inputs ${z.toFixed(1)}σ beyond anything observed.`,
      'Severity signal present, but outside validated support; treat as untrusted.',
    ],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/riskReading.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/riskReading.ts frontend/src/lib/riskReading.test.ts
git commit -m "feat(fe): pure riskReading view-model (no % above validated range)"
```

---

## Task 11: thin RiskReadingDisplay component

**Files:**
- Create: `frontend/src/components/RiskReadingDisplay.tsx`

No new test infra: the component is a thin renderer of the Task 10 view-model; correctness of the logic is already covered by `riskReading.test.ts`. Verified by `tsc -b`.

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/RiskReadingDisplay.tsx
import type { RiskReading } from '../types/api'
import { riskReadingView } from '../lib/riskReading'

/** Thin renderer: all logic (incl. the no-% guarantee) lives in riskReadingView. */
export function RiskReadingDisplay({ reading }: { reading: RiskReading }) {
  const v = riskReadingView(reading)
  return (
    <div className={`risk-reading risk-${v.kind}`}>
      {v.showsPercent && v.value && <span className="risk-value">{v.value}</span>}
      {v.tier && <span className="risk-tier">{v.tier}</span>}
      {v.lines.map((line, i) => (
        <div key={i} className="risk-line">{line}</div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/RiskReadingDisplay.tsx
git commit -m "feat(fe): thin RiskReadingDisplay rendering the view-model"
```

---

## Task 12: refactor reliability.ts + keep CurrentState compiling

**Files:**
- Modify: `frontend/src/lib/reliability.ts`
- Modify: `frontend/src/lib/reliability.test.ts`
- Modify: `frontend/src/pages/CurrentState.tsx` (it consumes `out_of_range` at line ~66 — must keep compiling)

**Goal:** `display_state` is authoritative. `reliability.ts` keeps only validated-zone track-record formatting; drop the hardcoded `MIN_N` and the `out_of_range`/`reference_bin` derivation. Because `CurrentState.tsx` reads `reliability.out_of_range`, this task updates that usage minimally so the typecheck stays green (full RiskReading consumption is Task 14).

- [ ] **Step 1: Write the failing guard test (append to `reliability.test.ts`)**

```typescript
// frontend/src/lib/reliability.test.ts  (append)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

test('reliability.ts no longer hardcodes MIN_N or re-derives out_of_range (single source of truth)', () => {
  const src = readFileSync(fileURLToPath(new URL('./reliability.ts', import.meta.url)), 'utf8')
  expect(src).not.toMatch(/const\s+MIN_N\s*=/)
  expect(src).not.toMatch(/out_of_range/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/reliability.test.ts -t "single source of truth"`
Expected: FAIL (the strings still exist).

- [ ] **Step 3: Refactor `reliability.ts`**

Remove `MIN_N` and the `out_of_range`/`reference_bin` fields from `ReliabilityContext` and `reliabilityFor`. Keep only validated-zone formatting:

```typescript
// frontend/src/lib/reliability.ts  (revised)
import type { ReliabilityBin, ReliabilityResponse } from '../types/api'

export interface ReliabilityContext {
  bin: ReliabilityBin | null
  base_rate: number
  max_evaluated_p: number
}

/** Validated-zone track-record context for a calibrated p. Stress handling is
 *  owned by the backend display_state + riskReadingView, not recomputed here. */
export function reliabilityFor(p: number, table: ReliabilityResponse): ReliabilityContext {
  const { bins, base_rate, max_evaluated_p } = table
  const bin = bins.find(b => p >= b.p_low && p < b.p_high) ?? null
  return { bin, base_rate, max_evaluated_p }
}

/** Validated-zone track-record line. Callers invoke only when display_state === 'validated'. */
export function reliabilityLine(ctx: ReliabilityContext): string {
  if (!ctx.bin) return ''
  const rate = Math.round(ctx.bin.empirical_rate * 100)
  const lo = Math.round(ctx.bin.p_low * 100)
  const hi = Math.round(ctx.bin.p_high * 100)
  const n = ctx.bin.n
  const baseRate = Math.round(ctx.base_rate * 100)
  return `Track record at ${lo}-${hi}%: worsened ${rate}% of the time (n=${n}; base rate ${baseRate}%).`
}
```

Remove or update any existing assertions in `reliability.test.ts` that referenced `out_of_range`/`reference_bin`.

- [ ] **Step 4: Keep `CurrentState.tsx` compiling**

Read `frontend/src/pages/CurrentState.tsx` around lines 55–75. Remove the `reliability?.out_of_range` usage. For now (full integration is Task 14), gate the out-of-range disclaimer on the backend contract if present, else don't show it:

```tsx
// CurrentState.tsx — replace the out_of_range branch with:
// (data.risk_reading is optional; absent on older backend)
const isStress = data.risk_reading != null && data.risk_reading.display_state !== 'validated'
// ...use `isStress` where `reliability.out_of_range` was used; render the validated
// reliabilityLine only when !isStress.
```

Do not add the full stress treatment yet — just keep types valid and behavior sane (validated rendering unchanged).

- [ ] **Step 5: Run tests + typecheck**

Run: `cd frontend && npx vitest run src/lib/reliability.test.ts && npx tsc -b`
Expected: PASS + clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/reliability.ts frontend/src/lib/reliability.test.ts frontend/src/pages/CurrentState.tsx
git commit -m "refactor(fe): reliability.ts single source of truth; drop MIN_N/out_of_range"
```

---

## Task 13: integrate into Scenario Explorer (full three-state)

**Files:**
- Modify: `frontend/src/pages/ScenarioExplorer.tsx`

**Confirmed path:** `frontend/src/pages/ScenarioExplorer.tsx` renders the scenario result.

- [ ] **Step 1: Read the current scenario risk render**

Read `frontend/src/pages/ScenarioExplorer.tsx`; locate where `scenario_risk` (or `baseline_risk`) is rendered as a percentage.

- [ ] **Step 2: Replace the scenario risk number with `RiskReadingDisplay`**

When `response.risk_reading` is present, render `<RiskReadingDisplay reading={response.risk_reading} />` in place of the raw `scenario_risk` percentage. Keep the baseline/driver UI. Fall back to the prior numeric rendering only when `risk_reading == null` (older backend).

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: clean. (Display logic is already unit-tested in `riskReading.test.ts`; this is a wiring change verified by the typechecker.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ScenarioExplorer.tsx
git commit -m "feat(fe): Scenario Explorer renders honest three-state RiskReading"
```

---

## Task 14: Current State — shared fallback (no redesign)

**Files:**
- Modify: `frontend/src/pages/CurrentState.tsx`

**Confirmed path:** `frontend/src/pages/CurrentState.tsx`. **Hard scope boundary (per spec):** keep today's validated rendering; the ONLY addition is delegating the rare stress case to the shared component. No bespoke Current State stress UI, no relayout.

- [ ] **Step 1: Minimal integration**

In the risk render: if `data.risk_reading && data.risk_reading.display_state !== 'validated'`, render `<RiskReadingDisplay reading={data.risk_reading} />`; otherwise render exactly today's validated treatment (the `reliabilityLine` path, unchanged). Reuse the `isStress` flag introduced in Task 12.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CurrentState.tsx
git commit -m "feat(fe): Current State delegates rare stress case to shared component (no redesign)"
```

---

## Task 15: full-suite gate + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Backend suite**

Run: `python3.13 -m pytest -q`
Expected: PASS (all prior + new backend tests).

- [ ] **Step 2: Frontend suite + typecheck**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: all tests pass, typecheck clean.

- [ ] **Step 3: Manual end-to-end sanity (local API)**

Start the API, then:
- `GET /current-state` → `risk_reading.display_state == "validated"` on a normal day, `validated_probability` set.
- `POST /scenario` with absurd inputs (vix_level 200, etc.) → `risk_reading.display_state == "stress_out_of_support"`, `validated_probability == null`, and the UI shows "no historical analog" with **no percentage**.
- `POST /scenario` with a moderate above-ceiling input → `stress_in_support` with a tier and the "ranks severity, not odds" note.

- [ ] **Step 4: Confirm the reference is version-consistent**

Run: `python3.13 -c "import json,glob; r=json.load(open('data/reliability/raw_score_reference.json')); m=json.load(open('data/models/xgb_transition/meta.json')); print('match:', r['model_version']==m.get('saved_at'))"`
Expected: `match: True`. (If a retrain happens, `scripts/build_raw_score_reference.py` must be re-run — note this in retrain ops, Done-when below.)

---

## Done-when

- `python3.13 -m pytest -q` green; `cd frontend && npx vitest run && npx tsc -b` green.
- `/current-state` and `/scenario` both return a populated `risk_reading`; the scenario "76%-style" raw number is no longer shown as a probability above the validated ceiling.
- Scenario Explorer renders all three states; Current State renders validated as before and delegates the rare stress case to the shared component (no redesign).
- `frontend/src/lib/reliability.ts` no longer contains `MIN_N` / `out_of_range` (single-source-of-truth guard passes).
- `data/reliability/raw_score_reference.json` exists and its `model_version` matches `xgb_transition` `saved_at`.
- **Retrain ops note:** `scripts/retrain.py` (or the retrain runbook) must re-run `scripts/build_raw_score_reference.py` after any model retrain, so the percentile reference stays version-matched. Add this as a follow-up if not wired here.

## Notes for the implementer

- **Interpreter:** backend is `python3.13`; frontend is `npx vitest run` / `npx tsc -b` from `frontend/`.
- **Read before edit:** `src/api/routes.py` (scenario ~527–600, current-state handler), `src/api/state.py` (`refresh`, artifact loads), `src/models/predict_live.py` (raw/cal at ~48–52), and the actual frontend component paths (grep first — names in the file map are indicative).
- **YAGNI:** no server-side presentational copy; the contract is typed primitives only. No Current State redesign. No severity rail, no rehorizon (future branches, per spec).
- **Read-only diagnostics:** `scripts/tier_histogram.py` only reads; it must never write artifacts.
