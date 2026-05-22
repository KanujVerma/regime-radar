# Reliability Trust Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the live-serving reliability table with the final production model's score distribution, add a `source` field so the frontend copy distinguishes OOF validation from in-sample historical analogs, and update the UI copy accordingly.

**Architecture:** Two reliability artifacts in `data/reliability/`: `transition_reliability.json` (production-aligned, served live) and `transition_reliability_oof.json` (OOF, research only). `source` field propagates from artifact → Pydantic schema → API response → TypeScript type → `ReliabilityContext` → copy logic. Frontend `reliabilityLine()` branches on `ctx.source` to use distinct copy for production in-sample vs OOF validated track record.

**Tech Stack:** Python 3 / Pydantic v2 / FastAPI / XGBoost / TypeScript / Vitest

---

## Files Touched

| File | Action | What changes |
|---|---|---|
| `scripts/build_reliability_table.py` | Modify | Add `--mode oof\|production` CLI flag, explicit bin edge constants, production scoring logic |
| `data/reliability/transition_reliability.json` | Regenerate | Production-aligned artifact (replaces OOF content) |
| `data/reliability/transition_reliability_oof.json` | Create | OOF artifact moved here |
| `src/api/schemas.py` | Modify | Add `source: str = "oof"` to `ReliabilityResponse` |
| `tests/test_api_smoke.py` | Modify | Assert `source` in reliability response |
| `frontend/src/types/api.ts` | Modify | Add `source?: string` to `ReliabilityResponse` |
| `frontend/src/lib/reliability.ts` | Modify | Add `range_status` + `source` to `ReliabilityContext`, split `reliabilityLine` by source |
| `frontend/src/lib/__tests__/reliability.test.ts` | Create | Unit tests for new branching logic |

---

## Task 1: Add `source` to backend schema + update smoke test

**Files:**
- Modify: `src/api/schemas.py:125-128`
- Modify: `tests/test_api_smoke.py:360-386`

- [ ] **Step 1: Write the failing test — add `source` assertion and `source` to mock table**

Open `tests/test_api_smoke.py`. Replace the existing `test_reliability_endpoint_returns_table` test (lines 360–386) with:

```python
def test_reliability_endpoint_returns_table(app_with_state, monkeypatch):
    """GET /reliability serves the committed JSON table including source field."""
    import src.api.routes as routes_mod

    table = {
        "bins": [
            {"p_low": 0.0, "p_high": 0.10, "p_mid": 0.05, "empirical_rate": 0.05, "n": 500},
            {"p_low": 0.10, "p_high": 0.30, "p_mid": 0.20, "empirical_rate": 0.15, "n": 200},
        ],
        "base_rate": 0.074,
        "max_evaluated_p": 0.30,
        "source": "production_insample",
    }
    routes_mod._reliability_cache = table

    app, _ = app_with_state
    from fastapi.testclient import TestClient
    client = TestClient(app)
    resp = client.get("/reliability")
    assert resp.status_code == 200
    data = resp.json()
    assert "bins" in data and "base_rate" in data and "max_evaluated_p" in data
    assert "source" in data
    assert data["source"] == "production_insample"
    assert isinstance(data["bins"], list) and len(data["bins"]) == 2
    assert data["max_evaluated_p"] == 0.30

    routes_mod._reliability_cache = None
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/kanuj/regime-radar && python3 -m pytest tests/test_api_smoke.py::test_reliability_endpoint_returns_table -v
```

Expected: FAIL — `assert "source" in data` fails because Pydantic strips unknown fields from the response (route uses `response_model=ReliabilityResponse` which does not yet have `source`).

- [ ] **Step 3: Add `source` field to `ReliabilityResponse` in `schemas.py`**

Open `src/api/schemas.py`. Change lines 125–128:

```python
class ReliabilityResponse(BaseModel):
    bins: list[ReliabilityBin]
    base_rate: float
    max_evaluated_p: float
    source: str = "oof"
```

The default `"oof"` ensures any existing artifact without a `source` field still validates and returns a meaningful value.

- [ ] **Step 4: Run the test to verify it passes**

```bash
python3 -m pytest tests/test_api_smoke.py::test_reliability_endpoint_returns_table -v
```

Expected: PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
python3 -m pytest -q
```

Expected: all tests passing (same count as before).

---

## Task 2: Update `build_reliability_table.py` with mode flag and production logic

**Files:**
- Modify: `scripts/build_reliability_table.py`

- [ ] **Step 1: Replace the entire script with the new dual-mode version**

```python
"""Precompute transition-risk empirical reliability tables.

Two modes:
  --mode production (default)
    Scores the historical feature matrix with the final production model +
    calibrator. Uses the same rows and realized outcomes as the OOF artifact
    but scores them with the live model family. Output: transition_reliability.json
    Source field: "production_insample"
    NOTE: scores are in-sample for the final model — upper-tail bins are
    inflated vs true OOF, but grounded in real realized outcomes.

  --mode oof
    Existing behavior: loads oof_predictions artifact (fold-model calibrated
    scores paired with realized outcomes). Output: transition_reliability_oof.json
    Source field: "oof"

Re-run both modes whenever OOF predictions are regenerated (e.g. after retrain).
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd

from src.models.registry import load_artifact, artifact_exists

# OOF bin edges: concentrated resolution in 0-30% where OOF scores live
OOF_BIN_EDGES = [0.0, 0.02, 0.05, 0.10, 0.15, 0.20, 0.30, 0.50, 1.0]

# Production bin edges: finer resolution in 0.30-0.80 where live scores concentrate
PRODUCTION_BIN_EDGES = [0.0, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 1.0]

MIN_N = 30
PRODUCTION_OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "reliability" / "transition_reliability.json"
OOF_OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "reliability" / "transition_reliability_oof.json"


def _build_bins(p: np.ndarray, y: np.ndarray, edges: list[float]) -> tuple[list[dict], float]:
    """Bin (scores, labels) pairs and compute empirical rates. Returns (bins, base_rate)."""
    base_rate = float(np.mean(y))
    bins = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (p >= lo) & (p < hi)
        n = int(mask.sum())
        empirical_rate = float(np.mean(y[mask])) if n > 0 else 0.0
        bins.append({
            "p_low": lo,
            "p_high": hi,
            "p_mid": round((lo + hi) / 2, 4),
            "empirical_rate": round(empirical_rate, 4),
            "n": n,
        })
    return bins, base_rate


def _max_evaluated_p(bins: list[dict]) -> float:
    max_p = 0.0
    for b in bins:
        if b["n"] >= MIN_N:
            max_p = b["p_high"]
    return max_p


def build_oof_table() -> dict:
    if not artifact_exists("oof_predictions"):
        raise RuntimeError("oof_predictions artifact not found. Run scripts/bootstrap_data.py first.")

    oof_df = load_artifact("oof_predictions")
    required = {"transition_risk", "transition_actual"}
    missing = required - set(oof_df.columns)
    if missing:
        raise ValueError(f"OOF DataFrame missing columns: {missing}")

    p = oof_df["transition_risk"].astype(float).values
    y = oof_df["transition_actual"].astype(int).values

    bins, base_rate = _build_bins(p, y, OOF_BIN_EDGES)
    return {
        "bins": bins,
        "base_rate": round(base_rate, 4),
        "max_evaluated_p": _max_evaluated_p(bins),
        "source": "oof",
    }


def build_production_table() -> dict:
    """Score the historical feature matrix with the final production model + calibrator.

    Uses OOF artifact dates and transition_actual labels so outcomes are identical
    to the OOF table — only the scoring system differs (final model vs fold models).
    """
    if not artifact_exists("oof_predictions"):
        raise RuntimeError("oof_predictions artifact not found.")
    if not artifact_exists("xgb_transition"):
        raise RuntimeError("xgb_transition artifact not found.")
    if not artifact_exists("xgb_transition_calibrator"):
        raise RuntimeError("xgb_transition_calibrator artifact not found.")

    from src.features.build_market_features import build_features
    from src.labeling.build_regime_labels import build_regime_labels
    from src.evaluation.calibration import apply_calibrator
    from src.utils.paths import PROCESSED_DIR

    oof_df = load_artifact("oof_predictions")
    transition_model = load_artifact("xgb_transition")
    calibrator = load_artifact("xgb_transition_calibrator")

    panel = pd.read_parquet(PROCESSED_DIR / "panel.parquet")
    regime = build_regime_labels(panel)
    features = build_features(panel, regime_series=regime).dropna()

    # Restrict to dates with known realized outcomes (OOF dates only)
    features_oof = features[features.index.isin(oof_df.index)]
    labels_oof = oof_df.loc[features_oof.index, "transition_actual"].astype(int)

    raw = transition_model.predict_proba(features_oof)[:, 1]
    p = apply_calibrator(calibrator, raw)
    y = labels_oof.values

    bins, base_rate = _build_bins(p, y, PRODUCTION_BIN_EDGES)
    return {
        "bins": bins,
        "base_rate": round(base_rate, 4),
        "max_evaluated_p": _max_evaluated_p(bins),
        "source": "production_insample",
    }


def _print_table(table: dict) -> None:
    print(f"  source: {table['source']}")
    print(f"  base_rate: {table['base_rate']:.4f}")
    print(f"  max_evaluated_p: {table['max_evaluated_p']}")
    print(f"  bins:")
    for b in table["bins"]:
        bar = "#" * int(b["empirical_rate"] * 40)
        flag = "" if b["n"] >= MIN_N else " (sparse)"
        print(f"    [{b['p_low']:.2f}, {b['p_high']:.2f})  n={b['n']:4d}  rate={b['empirical_rate']:.3f}  {bar}{flag}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build reliability table")
    parser.add_argument(
        "--mode",
        choices=["oof", "production"],
        default="production",
        help="'production' scores with final model (default); 'oof' uses walk-forward fold scores",
    )
    args = parser.parse_args()

    if args.mode == "oof":
        table = build_oof_table()
        output_path = OOF_OUTPUT_PATH
    else:
        table = build_production_table()
        output_path = PRODUCTION_OUTPUT_PATH

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(table, f, indent=2)

    print(f"Wrote {output_path}")
    _print_table(table)
```

- [ ] **Step 2: Verify the script is syntactically valid**

```bash
python3 -c "import scripts.build_reliability_table" 2>&1 || python3 scripts/build_reliability_table.py --help
```

Expected: prints help text, no import errors.

---

## Task 3: Generate both artifacts and run sanity check

**Files:**
- Regenerate: `data/reliability/transition_reliability.json`
- Create: `data/reliability/transition_reliability_oof.json`

- [ ] **Step 1: Generate the production artifact (replaces live-serving file)**

```bash
cd /Users/kanuj/regime-radar && python3 scripts/build_reliability_table.py --mode production
```

Expected output includes:
```
Wrote .../data/reliability/transition_reliability.json
  source: production_insample
  base_rate: ...
  max_evaluated_p: ...   ← should be > 0.30
  bins:
    [0.00, 0.05)  n= ...
    ...
    [0.50, 0.60)  n= ...  ← at least one bin above 0.30 must be non-empty
```

- [ ] **Step 2: Generate the OOF artifact (research/docs file)**

```bash
python3 scripts/build_reliability_table.py --mode oof
```

Expected output includes:
```
Wrote .../data/reliability/transition_reliability_oof.json
  source: oof
  max_evaluated_p: 0.3
```

- [ ] **Step 3: Run sanity check — verify production table is materially different from old OOF table**

```bash
python3 -c "
import json
with open('data/reliability/transition_reliability.json') as f:
    prod = json.load(f)
with open('data/reliability/transition_reliability_oof.json') as f:
    oof = json.load(f)

print('=== SANITY CHECK ===')
assert prod['source'] == 'production_insample', f'Expected production_insample, got {prod[\"source\"]}'
assert oof['source'] == 'oof', f'Expected oof, got {oof[\"source\"]}'

# At least one bin above 0.30 must be populated in production table
bins_above_30 = [b for b in prod['bins'] if b['p_low'] >= 0.30 and b['n'] > 0]
assert len(bins_above_30) >= 1, f'No populated bins above 0.30 in production table'

# Production max_evaluated_p must exceed OOF max_evaluated_p
assert prod['max_evaluated_p'] > oof['max_evaluated_p'], (
    f'Production max_evaluated_p ({prod[\"max_evaluated_p\"]}) should exceed '
    f'OOF max_evaluated_p ({oof[\"max_evaluated_p\"]})'
)

print(f'  source: {prod[\"source\"]} ✓')
print(f'  production max_evaluated_p: {prod[\"max_evaluated_p\"]} > OOF {oof[\"max_evaluated_p\"]} ✓')
print(f'  bins above 0.30 with n>0: {[(b[\"p_low\"], b[\"p_high\"], b[\"n\"]) for b in bins_above_30]} ✓')
print('All checks passed.')
"
```

Expected: All three assertions pass. If production `max_evaluated_p` is not greater than OOF's 0.30, the rescoring did not produce enough support in the upper tail — investigate before proceeding.

- [ ] **Step 4: Run full test suite — verify no regressions from schema change**

```bash
python3 -m pytest -q
```

Expected: all tests passing.

---

## Task 4: Update frontend types and `reliability.ts` — write tests first

**Files:**
- Modify: `frontend/src/types/api.ts`
- Create: `frontend/src/lib/__tests__/reliability.test.ts`
- Modify: `frontend/src/lib/reliability.ts`

- [ ] **Step 1: Add `source` to `ReliabilityResponse` in `frontend/src/types/api.ts`**

Change lines 102–106:

```typescript
export interface ReliabilityResponse {
  bins: ReliabilityBin[]
  base_rate: number
  max_evaluated_p: number
  source?: string
}
```

The `?` makes it optional for backward compatibility with any test fixtures that don't include it.

- [ ] **Step 2: Write failing tests for the new reliability logic**

Create `frontend/src/lib/__tests__/reliability.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { reliabilityFor, reliabilityLine } from '../reliability'
import type { ReliabilityResponse } from '../../types/api'

const makeTable = (overrides: Partial<ReliabilityResponse> = {}): ReliabilityResponse => ({
  base_rate: 0.09,
  max_evaluated_p: 0.70,
  source: 'production_insample',
  bins: [
    { p_low: 0.0,  p_high: 0.10, p_mid: 0.05, empirical_rate: 0.05, n: 800 },
    { p_low: 0.10, p_high: 0.30, p_mid: 0.20, empirical_rate: 0.12, n: 400 },
    { p_low: 0.30, p_high: 0.50, p_mid: 0.40, empirical_rate: 0.15, n: 120 },
    { p_low: 0.50, p_high: 0.70, p_mid: 0.60, empirical_rate: 0.18, n: 55  },
    { p_low: 0.70, p_high: 0.80, p_mid: 0.75, empirical_rate: 0.22, n: 8   },  // sparse
    { p_low: 0.80, p_high: 1.0,  p_mid: 0.90, empirical_rate: 0.0,  n: 0   },
  ],
  ...overrides,
})

describe('reliabilityFor — production_insample source', () => {
  it('returns range_status=supported for p in a well-populated bin', () => {
    const ctx = reliabilityFor(0.55, makeTable())
    expect(ctx.range_status).toBe('supported')
    expect(ctx.source).toBe('production_insample')
  })

  it('returns range_status=sparse for p in a bin with n < MIN_N', () => {
    const ctx = reliabilityFor(0.75, makeTable())
    expect(ctx.range_status).toBe('sparse')
  })

  it('returns range_status=beyond for p above max_evaluated_p', () => {
    const ctx = reliabilityFor(0.85, makeTable())
    expect(ctx.range_status).toBe('beyond')
  })

  it('returns range_status=beyond when no matching bin exists', () => {
    // p=1.0 is beyond the last bin edge
    const ctx = reliabilityFor(1.0, makeTable())
    expect(ctx.range_status).toBe('beyond')
  })

  it('range_status=beyond takes priority over sparse even if a bin exists with low n', () => {
    // p=0.75 is in a sparse bin [0.70, 0.80) BUT also above max_evaluated_p=0.70
    // beyond should win
    const ctx = reliabilityFor(0.75, makeTable())
    expect(ctx.range_status).toBe('beyond')
  })
})

describe('reliabilityLine — production_insample copy', () => {
  it('supported: uses "historical analogs" language with n and rate', () => {
    const ctx = reliabilityFor(0.55, makeTable())
    const line = reliabilityLine(ctx)
    expect(line).toContain('historical analogs')
    expect(line).toContain('production model')
    expect(line).toContain('not out-of-fold validation')
    expect(line).toContain('n=55')
    expect(line).toContain('18%')
  })

  it('sparse: uses "limited support" language', () => {
    const ctx = reliabilityFor(0.75, makeTable({ max_evaluated_p: 0.80 }))
    const line = reliabilityLine(ctx)
    expect(line).toContain('limited')
    expect(line).toContain('directional stress signal')
    expect(line).toContain('n=8')
  })

  it('beyond: uses "above historical range" language', () => {
    const ctx = reliabilityFor(0.85, makeTable())
    const line = reliabilityLine(ctx)
    expect(line).toContain('historical range')
    expect(line).toContain('directional stress signal')
  })
})

describe('reliabilityLine — oof source (existing behavior preserved)', () => {
  const oofTable = makeTable({
    source: 'oof',
    max_evaluated_p: 0.30,
    bins: [
      { p_low: 0.0,  p_high: 0.10, p_mid: 0.05, empirical_rate: 0.05, n: 800 },
      { p_low: 0.10, p_high: 0.30, p_mid: 0.20, empirical_rate: 0.12, n: 400 },
      { p_low: 0.30, p_high: 1.0,  p_mid: 0.65, empirical_rate: 0.18, n: 10  },
    ],
  })

  it('in-range bin uses "Track record" language', () => {
    const ctx = reliabilityFor(0.15, oofTable)
    const line = reliabilityLine(ctx)
    expect(line).toContain('Track record')
    expect(line).toContain('base rate')
  })

  it('out-of-range uses "above evaluated range" language with reference bin', () => {
    const ctx = reliabilityFor(0.75, oofTable)
    const line = reliabilityLine(ctx)
    expect(line).toContain('Above the model')
    expect(line).toContain('evaluated range')
  })
})

describe('reliabilityFor — source field propagation', () => {
  it('embeds source from table into context', () => {
    const ctx = reliabilityFor(0.15, makeTable({ source: 'production_insample' }))
    expect(ctx.source).toBe('production_insample')
  })

  it('defaults source to oof when table.source is undefined', () => {
    const table = makeTable()
    delete (table as any).source
    const ctx = reliabilityFor(0.15, table)
    expect(ctx.source).toBe('oof')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail (expected — `range_status` and `source` don't exist yet)**

```bash
cd /Users/kanuj/regime-radar/frontend && npx vitest run src/lib/__tests__/reliability.test.ts 2>&1 | tail -20
```

Expected: FAIL — `range_status` not found on `ReliabilityContext`, `source` not on context.

- [ ] **Step 4: Rewrite `frontend/src/lib/reliability.ts` with full new implementation**

```typescript
import type { ReliabilityBin, ReliabilityResponse } from '../types/api'

export interface ReliabilityContext {
  /** Whether the live reading is beyond the model's historically evaluated range (OOF semantics) */
  out_of_range: boolean
  /** Granular range classification used by production_insample copy branching */
  range_status: 'supported' | 'sparse' | 'beyond'
  /** Source of the reliability table — propagated from ReliabilityResponse.source */
  source: string
  bin: ReliabilityBin | null
  reference_bin: ReliabilityBin | null
  base_rate: number
  max_evaluated_p: number
}

const MIN_N = 30

export function reliabilityFor(p: number, table: ReliabilityResponse): ReliabilityContext {
  const { bins, base_rate, max_evaluated_p } = table
  const source = table.source ?? 'oof'

  const bin = bins.find(b => p >= b.p_low && p < b.p_high) ?? null
  const reference_bin = [...bins]
    .reverse()
    .find(b => b.n >= MIN_N) ?? null

  // OOF-style boolean (preserved for backward compat)
  const out_of_range =
    p > max_evaluated_p ||
    bin === null ||
    bin.n < MIN_N

  // range_status evaluation order per spec:
  // 1. no matching bin OR p above supported range → 'beyond'
  // 2. bin exists but n < MIN_N → 'sparse'
  // 3. else → 'supported'
  let range_status: 'supported' | 'sparse' | 'beyond'
  if (bin === null || p > max_evaluated_p) {
    range_status = 'beyond'
  } else if (bin.n < MIN_N) {
    range_status = 'sparse'
  } else {
    range_status = 'supported'
  }

  return { out_of_range, range_status, source, bin, reference_bin, base_rate, max_evaluated_p }
}

export function reliabilityLine(ctx: ReliabilityContext): string {
  if (ctx.source === 'production_insample') {
    return _productionLine(ctx)
  }
  return _oofLine(ctx)
}

function _productionLine(ctx: ReliabilityContext): string {
  if (ctx.range_status === 'beyond') {
    return `Above the live model's historical range. Treat as a directional stress signal — no comparable historical analog.`
  }

  if (!ctx.bin) return ''
  const pct = Math.round(ctx.bin.p_mid * 100)
  const rate = Math.round(ctx.bin.empirical_rate * 100)
  const n = ctx.bin.n

  if (ctx.range_status === 'sparse') {
    return `The live model has produced readings in this range before, but historical support is limited (n=${n}). Treat as a directional stress signal, not a validated probability.`
  }

  return `In historical periods where the live model gave similar readings (~${pct}%), conditions worsened ${rate}% of the time (n=${n}; historical analogs from the current production model — not out-of-fold validation).`
}

function _oofLine(ctx: ReliabilityContext): string {
  if (ctx.out_of_range) {
    const maxPct = Math.round(ctx.max_evaluated_p * 100)
    if (ctx.reference_bin && ctx.reference_bin.n >= MIN_N) {
      const refPct = Math.round(ctx.reference_bin.p_mid * 100)
      const rate = Math.round(ctx.reference_bin.empirical_rate * 100)
      const n = ctx.reference_bin.n
      return `Above the model's evaluated range (max ~${maxPct}%). Closest historical readings (~${refPct}%): worsened ${rate}% of the time (n=${n} — small sample, treat with caution).`
    }
    return `Above the model's evaluated range (max ~${maxPct}%). No comparable historical readings — treat as a directional flag, not a calibrated probability.`
  }

  if (!ctx.bin) return ''

  const rate = Math.round(ctx.bin.empirical_rate * 100)
  const lo = Math.round(ctx.bin.p_low * 100)
  const hi = Math.round(ctx.bin.p_high * 100)
  const n = ctx.bin.n
  const baseRate = Math.round(ctx.base_rate * 100)

  if (n < MIN_N) {
    return `Track record at ${lo}–${hi}%: worsened ${rate}% of the time (n=${n} — small sample).`
  }

  return `Track record at ${lo}–${hi}%: worsened ${rate}% of the time (n=${n}; base rate ${baseRate}%).`
}
```

- [ ] **Step 5: Run the frontend unit tests to verify they pass**

```bash
cd /Users/kanuj/regime-radar/frontend && npx vitest run src/lib/__tests__/reliability.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Run the full frontend test suite to verify no regressions**

```bash
cd /Users/kanuj/regime-radar/frontend && npx vitest run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 7: TypeScript build check**

```bash
cd /Users/kanuj/regime-radar/frontend && npx tsc --noEmit 2>&1
```

Expected: no type errors.

---

## Task 5: Run full Python test suite, then commit everything

- [ ] **Step 1: Final Python test suite run**

```bash
cd /Users/kanuj/regime-radar && python3 -m pytest -q
```

Expected: all tests pass.

- [ ] **Step 2: Commit**

```bash
cd /Users/kanuj/regime-radar && git add \
  scripts/build_reliability_table.py \
  data/reliability/transition_reliability.json \
  data/reliability/transition_reliability_oof.json \
  src/api/schemas.py \
  tests/test_api_smoke.py \
  frontend/src/types/api.ts \
  frontend/src/lib/reliability.ts \
  frontend/src/lib/__tests__/reliability.test.ts \
  docs/superpowers/specs/2026-05-22-reliability-trust-fix-design.md \
  docs/superpowers/plans/2026-05-22-reliability-trust-fix.md

git commit -m "$(cat <<'EOF'
feat: align reliability table with production model + guardrail copy fix

Rebuilds the live-serving reliability table from final production model
scores so the reliability context and live score speak the same language.
Adds source field (production_insample vs oof) to artifact/API/types,
and branches UI copy to distinguish historical analogs from OOF-validated
track record. Preserves OOF table as research artifact.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**
- ✓ Two artifacts (`transition_reliability.json` production, `transition_reliability_oof.json` OOF)
- ✓ `OOF_BIN_EDGES` and `PRODUCTION_BIN_EDGES` explicit constants
- ✓ `source` field in artifact/schema/types/context
- ✓ `max_evaluated_p` preserved in both artifacts
- ✓ `range_status` three-case logic with correct priority order (beyond before sparse)
- ✓ Production copy uses "historical analogs" language in all three cases
- ✓ OOF copy unchanged
- ✓ Smoke test asserts `source == "production_insample"`
- ✓ Sanity check verifies production table is materially different
- ✓ Both modes run before commit

**Placeholder scan:** No TBDs, TODOs, or vague steps found.

**Type consistency check:**
- `ReliabilityContext.range_status` defined in Task 4 step 4, tested in Task 4 step 2 — consistent
- `ReliabilityContext.source: string` defined in Task 4 step 4, tested in Task 4 step 2 — consistent
- `reliabilityLine(ctx: ReliabilityContext): string` — signature unchanged, no call-site changes needed
- `ReliabilityResponse.source?: string` — optional in TS type, `?? 'oof'` fallback in `reliabilityFor` handles missing field
- `ReliabilityResponse.source: str = "oof"` — default in Pydantic handles old artifacts without the field

**One edge case confirmed:** Task 4 test "range_status=beyond takes priority over sparse" — p=0.75 is in a sparse bin [0.70, 0.80) with n=8, but also above max_evaluated_p=0.70. The implementation checks `p > max_evaluated_p` first, returning `'beyond'`. Test fixture matches this exactly.
