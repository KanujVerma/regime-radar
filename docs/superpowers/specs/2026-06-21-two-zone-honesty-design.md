# Two-Zone Honesty — Design Spec (2026-06-21)

**Status:** Draft for review
**Companion evidence:** `docs/superpowers/plans/2026-06-20-predictability-ceiling-diagnostic.md` + its run verdict (Branch A by the letter of the rule, but driven by base-rate inflation; current 5-day product genuinely capped at `max_evaluated_p ≈ 0.30`; `extrapolation_fraction = 0.60`).

## Problem

Regime Radar's value is one trustworthy number. Today that number is self-undermining: the live transition score is an honestly-calibrated probability that caps near 0.30, but the **Scenario Explorer renders scores up to ~0.76 as if they were calibrated probabilities** — above the validated range and, for 60% of the reachable scenario space, with no historical analog at all. A caption ("treat as a directional stress signal") is bolted on frontend-side, but the *number itself* still looks like calibrated odds. This spec replaces the bolt-on with permanent architecture.

This is **not** a model change and **not** a rehorizon. The 5-day horizon stays. We change how the existing number is *typed, bounded, and presented*.

## Design principles (resolved in brainstorming)

1. **Two orthogonal axes, never fused.**
   - **Severity** — how loud is the model's alarm relative to its own history.
   - **Support** — do the inputs still resemble anything historically observed.
   A single number cannot answer "genuinely severe but grounded" vs "off-the-map input the model is hallucinating on." Keep them separate.
2. **Severity above the ceiling is a percentile of the RAW score, not a probability.** Calibration compresses the stress zone to near-zero resolution (`cal_max ≈ 0.36` while `raw_max ≈ 0.97`); the high-end ordering only survives in the raw score. The stress value is therefore the **empirical percentile of today's raw transition score within the historical raw-score distribution** — a falsifiable statement about the model's own output history, explicitly not market odds.
3. **The human-facing translation layer is historical analogs, not the bare percentile.** "The model's alarm is at a level last reached in Mar 2020 / Feb 2018" is concrete and falsifiable. Analog availability maps exactly onto the support axis: `stress_in_support` has neighbours (show them); `stress_out_of_support` has none (its headline *is* "no historical analog").
4. **Boundary sits exactly at `max_evaluated_p`.** Conservatism is a `MIN_N` policy (require more samples), not an ad-hoc margin below the ceiling.
5. **Backend owns the contract; the frontend renders a typed reading.** This kills the duplicated `MIN_N` heuristic currently in `frontend/src/lib/reliability.ts` and prevents drift.

## The contract: `RiskReading`

Every surface that exposes a transition number (current-state, scenario) embeds one `RiskReading`. Backend-computed and authoritative.

```
RiskReading {
  display_state: "validated" | "stress_in_support" | "stress_out_of_support"
  validated_probability: float | null    # calibrated p; meaningful ONLY in validated state
  stress_percentile: float | null        # raw-score historical percentile [0,1]; stress states only
  stress_tier: "Elevated" | "High" | "Extreme" | null
  nearest_analogs: [ { label: str, date: str, raw_score: float } ] | null  # stress_in_support only
  support: { in_support: bool, nn_z_distance: float }
  max_evaluated_p: float
}
```

### Orthogonal primitives → derived `display_state`

`display_state` is **derived on the backend** from two independent primitives, with **support evaluated first** so the 2×2 collapses correctly:

| | in-support | out-of-support |
|---|---|---|
| p ≤ `max_evaluated_p` | `validated` | `stress_out_of_support` |
| p > `max_evaluated_p`  | `stress_in_support` | `stress_out_of_support` |

```
if not support.in_support:      display_state = "stress_out_of_support"
elif p > max_evaluated_p:       display_state = "stress_in_support"
else:                           display_state = "validated"
```

The otherwise-hidden fourth cell (out-of-support but low p — an exotic scenario combo that nets to calm) maps cleanly to `stress_out_of_support` with a low `stress_percentile`. Support dominates trust, so it wins the precedence.

- **validated:** `validated_probability` set; `stress_*` null. Frontend renders exactly today's calibrated-probability + reliability-track-record treatment.
- **stress_in_support:** `validated_probability` null; `stress_percentile` + `stress_tier` + `nearest_analogs` set. No percent shown.
- **stress_out_of_support:** `validated_probability` null; `stress_percentile` + `stress_tier` set; `nearest_analogs` null; `support.in_support = false`. Headline is "no historical analog (inputs Nσ beyond anything observed)".

Every field is nullable so a future falsifiable severity rail (Branch B) or rehorizon contract (Option C) slots in without breaking consumers (see Future paths).

## Components & responsibilities

### Backend

1. **Persist raw OOF scores (data dependency).**
   `train_transition_model` computes `oof_scores_raw` but only persists the calibrated `transition_risk` into the `oof_predictions` artifact. Add the raw OOF scores to the served reference so the stress percentile has a historical CDF to rank against. Concretely: add a `transition_risk_raw` column to the `oof_predictions` artifact (via `build_oof_dataframe`), and expose the sorted raw-score reference for percentile lookup. This is the only training/artifact change; it is additive (no model retrain required beyond a rebuild that re-persists OOF with the extra column).

2. **`stress_percentile(raw_score, raw_reference)`** — empirical percentile of a raw score within the historical raw-score reference distribution. Pure function. Rank-preserving.

3. **`stress_tier(stress_percentile)`** — map percentile → `Elevated | High | Extreme` by fixed cutpoints (e.g. ≥0.80 / ≥0.95 / ≥0.99; exact cutpoints chosen and documented in the plan). Ordinal only.

4. **Support classification** — reuse `src/evaluation/support_distance.py` (`nn_distance`, `SCENARIO_BASELINE_FEATURES`) to compute `nn_z_distance` for the reading's condition vector against the historical reference; `in_support = nn_z_distance <= z_threshold`.

5. **`build_risk_reading(raw_score, calibrated_p, condition_vector, reference) -> RiskReading`** — the single assembler. Computes both primitives, derives `display_state`, attaches analogs (via existing `find_analogs`) only when `stress_in_support`. Used by both the current-state and scenario serving paths.

6. **Serving paths** — current-state and scenario responses embed `RiskReading`. Both already have the raw model output available at serve time (the model produces raw; the calibrator produces calibrated) — expose the raw score to the assembler instead of discarding it.

### Frontend

1. **Replace `reliability.ts` heuristics with contract consumption.** Delete the frontend `MIN_N` / `out_of_range` re-derivation; render off `display_state`. `reliability.ts` keeps only the validated-zone track-record formatting (which legitimately uses the reliability bins).

2. **Three render treatments**, switched on `display_state`:
   - `validated` → calibrated probability + reliability line (unchanged from today).
   - `stress_in_support` → **no percent**; primary copy = analogs ("alarm at a level last seen in …"); secondary = tier + "more extreme than X% of historical readings — ranks severity, not odds."
   - `stress_out_of_support` → **no percent**; headline = "No historical analog — inputs Nσ beyond anything observed"; tier shown, strongest disclaimer; no analogs.

3. **Scope: Scenario Explorer first.** Scenario Explorer is where the misleading 76% lives and the only surface that reaches out-of-support, so it gets the full three-state treatment first. Current State consumes the same contract but is `validated` on ~every real day, so it needs only a minimal stress fallback (render the stress treatment if it ever arrives), not a redesign.

## Data flow

```
panel → build_features → raw model.predict_proba ─┬─→ raw_score ──→ stress_percentile ─┐
                                                  └─→ calibrator ─→ calibrated_p ──────┤
condition_vector ─→ support_distance.nn_distance ─→ nn_z_distance ─→ in_support ───────┤
                                                                                       ▼
                                          build_risk_reading → RiskReading → API response → frontend render
historical raw OOF scores (persisted) ────────────────────────────────────────────────^ (reference CDF)
historical condition vectors ─────────────────────────────────────────────────────────^ (support reference + analogs)
```

## Error / edge handling

- **Missing raw reference** (artifact predates the raw-score column): `build_risk_reading` falls back to `validated`-only behaviour and logs a warning; no stress percentile is fabricated. Surfaces as "rebuild OOF artifact" in ops.
- **Empty / degenerate raw reference** (n too small): treat percentile as unavailable → `stress_percentile = null`, tier null, but `display_state` still set from the support + ceiling primitives (so out-of-support is still flagged).
- **Calibrated p exactly at boundary** (`p == max_evaluated_p`): `validated` (boundary inclusive on the validated side, matching `_max_evaluated_p` semantics).
- **No analogs found** while `stress_in_support`: degrade copy to percentile + tier only; do not invent analogs.

## Testing strategy

- **Pure functions** (`stress_percentile`, `stress_tier`, support classification, `display_state` derivation) — unit tests with synthetic reference distributions; assert rank-preservation, the 2×2 precedence table (all four cells incl. out-of-support-low-p), and boundary-inclusive validated.
- **`build_risk_reading`** — table-driven test over the 2×2 asserting exact field nullability per state and that analogs appear only in `stress_in_support`.
- **Serving** — API smoke: scenario at maxed sliders returns `stress_out_of_support` with `validated_probability = null` and no fabricated percent; a normal live day returns `validated`.
- **Frontend** — render tests per `display_state` asserting **no `%` string appears** in either stress treatment, and that out-of-support shows the "no historical analog" headline.
- **Regression guard** — a test asserting `frontend/src/lib/reliability.ts` no longer hardcodes `MIN_N` / re-derives `out_of_range` (single-source-of-truth lock).

## Non-goals / future paths (explicitly preserved)

- **Not rehorizoning.** 5-day stays. The diagnostic showed the only "headroom" is base-rate inflation, not model skill (flat ~2.2x lift across horizons). **Option C / rehorizon to a ~month-scale signal remains a valid future branch** if we later decide on product grounds that the headline should mean "next month" rather than "next week"; the `RiskReading` contract is forward-compatible with that change (the calibrated-probability field simply re-binds to a longer-horizon model).
- **Not building the severity rail yet.** A separate falsifiable model on observable forward realized-vol / drawdown is the cleanest long-term way to honestly differentiate the out-of-support high end. It is deferred until two-zone honesty ships and we can judge whether it is sufficient on its own. The contract reserves room: a future `severity_rail` field slots beside `stress_percentile` without breaking consumers.
- Not changing the regime taxonomy, calibration method, or walk-forward config.

## Open parameters to fix in the plan

- Exact `stress_tier` percentile cutpoints (proposed ≥0.80 / ≥0.95 / ≥0.99).
- `z_threshold` for `in_support` (Prong-2 diagnostic used 3.0; confirm or tighten).
- Number of `nearest_analogs` surfaced (proposed 2–3).
