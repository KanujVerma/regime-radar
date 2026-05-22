# Reliability Trust Fix: Production-Aligned Table + Guardrail Copy

**Date:** 2026-05-22
**Status:** Approved for implementation

---

## Problem

The live app shows a transition-risk score (currently 75.9%) alongside a reliability context drawn from `transition_reliability.json`. That table was built from out-of-fold (OOF) walk-forward fold models, whose calibrated scores never exceeded ~0.355. The final production model + final calibrator produces a different score distribution — the two are not the same system and are not speaking the same language.

The current UI surfacing of "Closest historical readings (~25%): worsened 16% of the time (n=306)" is misleading: the ~25% reference bin is from OOF fold models, not the live model, and the live score of 0.759 is not a "closest historical reading" to any OOF bin — it is far outside the OOF domain entirely.

**Diagnosis summary:**
- Features are clean (all within historical training range)
- Raw model score = calibrated score (1.00× multiplier) — calibrator is not amplifying
- Root cause: final model + final calibrator is a materially different scoring system than OOF fold models
- The live score is directionally meaningful but cannot be validated against OOF-based bins

---

## Design

### Artifacts

Two reliability JSON files in `data/reliability/`:

| File | Source | Served live? | Purpose |
|---|---|---|---|
| `transition_reliability.json` | Final model + final calibrator rescored against OOF dates/labels | **Yes** (`/reliability` endpoint) | Live UI reliability context |
| `transition_reliability_oof.json` | OOF fold predictions (existing behavior) | No | Research, methodology docs, regression baseline |

Both files include a `source` field:
- `"production_insample"` — production table
- `"oof"` — OOF table

Both files include `max_evaluated_p` — the highest bin edge where n ≥ MIN_N. This is the supported-range boundary, distinct from the raw highest observed score.

### Production table construction

The production table uses the **same rows and labels** as the OOF artifact (7,812 rows, 1995-04-07 to 2026-04-23) but rescores them with the final production model + final calibrator:

```
production_score = apply_calibrator(final_calibrator, final_model.predict_proba(X)[:, 1])
```

Labels (`transition_actual`) come from the OOF artifact. The 20 feature rows after the OOF cutoff (2026-04-24 to 2026-05-21) are excluded — no realized 5-day outcomes available.

Known limitation: these scores are in-sample for the final model. XGBoost in-sample scores inflate the upper tail relative to true OOF behavior. This is documented in the artifact via the `source` field and surfaced in UI copy. The empirical_rate values within each bin are still grounded in real realized outcomes from those historical rows.

### Bin edges

Two constants in `build_reliability_table.py`:

```python
OOF_BIN_EDGES = [0.0, 0.02, 0.05, 0.10, 0.15, 0.20, 0.30, 0.50, 1.0]
# Optimized for 0–30% OOF score range

PRODUCTION_BIN_EDGES = [0.0, 0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 1.0]
# Finer resolution in 0.30–0.80 range where live scores concentrate
```

MIN_N = 30 (unchanged, shared across both modes).

### Script changes: `scripts/build_reliability_table.py`

Add `--mode oof|production` CLI flag. Default: `production`.

- `--mode oof`: existing logic, outputs to `transition_reliability_oof.json`, adds `"source": "oof"` to JSON
- `--mode production`: new logic, outputs to `transition_reliability.json`, adds `"source": "production_insample"` to JSON

Both modes are run as part of the commit to generate both artifacts.

### API changes

**`src/api/schemas.py`** — add `source: str` to `ReliabilityResponse`:

```python
class ReliabilityResponse(BaseModel):
    bins: List[ReliabilityBin]
    base_rate: float
    max_evaluated_p: float
    source: str  # "oof" or "production_insample"
```

**`src/api/routes.py`** — no changes. `/reliability` reads `transition_reliability.json` which is now the production table.

### Frontend type changes

**`frontend/src/types/api.ts`** — add `source: string` to `ReliabilityResponse`:

```typescript
export interface ReliabilityResponse {
  bins: ReliabilityBin[]
  base_rate: number
  max_evaluated_p: number
  source: string  // "oof" | "production_insample"
}
```

### `frontend/src/lib/reliability.ts` — logic changes

Add `range_status` to `ReliabilityContext`:

```typescript
export interface ReliabilityContext {
  out_of_range: boolean          // kept for backward compat (OOF source)
  range_status: 'supported' | 'sparse' | 'beyond'   // new — used by production source
  bin: ReliabilityBin | null
  reference_bin: ReliabilityBin | null
  base_rate: number
  max_evaluated_p: number
}
```

`range_status` is computed in `reliabilityFor()`:
- `p > max_evaluated_p` → `'beyond'`
- `bin !== null && bin.n < MIN_N` → `'sparse'`
- else → `'supported'`

`reliabilityLine()` branches on `table.source` first:

**`source === "production_insample"`:**

Case 1 — `range_status === 'supported'` (in-range, n ≥ 30):
```
In historical periods where the live model gave similar readings (~{pct}%),
conditions worsened {rate}% of the time (n={n}; historical analogs from the current
production model — not out-of-fold validation).
```

Case 2 — `range_status === 'sparse'` (bin exists, n < 30):
```
The live model has produced readings in this range before, but historical support
is limited (n={n}). Treat as a directional stress signal, not a validated probability.
```

Case 3 — `range_status === 'beyond'` (above max_evaluated_p):
```
Above the live model's historical range. Treat as a directional stress signal —
no comparable historical analog.
```

**`source === "oof"` (unchanged behavior):**

In-range, n ≥ 30:
```
Track record at {lo}–{hi}%: worsened {rate}% of the time (n={n}; base rate {base}%).
```

Out-of-range (existing fallback to reference_bin):
```
Above the model's evaluated range (max ~{max}%). Closest historical readings (~{ref}%):
worsened {rate}% of the time (n={n} — small sample, treat with caution).
```

### Test changes

**`tests/test_api_smoke.py`** — `TestReliabilityEndpoint`:
- Assert `source` field present in response
- Assert `source == "production_insample"` (the live-serving table)

### Commit contents

1. `scripts/build_reliability_table.py` — mode flag, production mode logic, explicit bin edge constants
2. `data/reliability/transition_reliability.json` — regenerated (production-aligned)
3. `data/reliability/transition_reliability_oof.json` — new file (OOF table, research only)
4. `src/api/schemas.py` — `source` field on `ReliabilityResponse`
5. `frontend/src/types/api.ts` — `source` field on `ReliabilityResponse`
6. `frontend/src/lib/reliability.ts` — `range_status` on context, three-case production copy, source branching
7. `tests/test_api_smoke.py` — assert `source` in reliability response

---

## What this does not change

- The `/reliability` endpoint URL and response structure (backward-compatible; `source` is additive)
- The OOF artifact (`oof_predictions`) — still used as the label/date source for production table construction
- The model itself — no retrain
- Any other frontend components that consume `ReliabilityResponse`

---

## Out of scope

- Monthly retrain + drift/eval gate (next project)
- Adding `max_observed_p` to the artifact JSON (nice-to-have debugging field, not load-bearing)
- Filtering UI or source-switcher in the frontend
- Exposing the OOF table via a separate API endpoint
