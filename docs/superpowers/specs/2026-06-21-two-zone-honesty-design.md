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
  analog_status: "not_applicable" | "available" | "unavailable"  # explicit; never inferred client-side
  nearest_analogs: [ { label: str, date: str, raw_score: float } ] | null  # set iff analog_status == "available"
  support: { in_support: bool, nn_z_distance: float }
  max_evaluated_p: float
}
```

**`analog_status` is an explicit semantic field, not a frontend inference.** Three meanings that must not be collapsed into `nearest_analogs == null`:
- `not_applicable` — `validated` or `stress_out_of_support` (analogs deliberately not offered).
- `available` — `stress_in_support` and `find_analogs` returned neighbors (`nearest_analogs` set).
- `unavailable` — `stress_in_support` but `find_analogs` returned nothing (in-support per the 6-D condition subspace does not strictly guarantee the analog index finds neighbors). Frontend degrades copy to percentile + tier only.

**Backend owns semantics; frontend owns wording.** The contract deliberately carries NO server-side presentational prose. Every field above is a typed semantic primitive; the human copy ("No historical analog — inputs Nσ beyond anything observed", "ranks severity, not odds") is generated client-side from these fields. Rationale: this is a credibility-messaging feature whose copy iterates frequently; prose in the API would ossify wording behind backend deploys to solve a multi-client problem we do not have (one client).

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
- **stress_in_support:** `validated_probability` null; `stress_percentile` + `stress_tier` set; `analog_status` is `available` (with `nearest_analogs`) or `unavailable` (null). No percent shown.
- **stress_out_of_support:** `validated_probability` null; `stress_percentile` + `stress_tier` set; `analog_status = "not_applicable"`, `nearest_analogs` null; `support.in_support = false`. Headline is "no historical analog (inputs Nσ beyond anything observed)".

**`stress_out_of_support` is not "maximum severity."** It is a *different epistemic condition*: a severity signal is present, but trust in it is downgraded because the inputs sit outside historical support. A `stress_out_of_support` reading can have a *low* `stress_percentile` (the model isn't even alarmed) and still be the least trustworthy state. Do not render or reason about it as "the scariest tier of stress" — it is an orthogonal trust downgrade. The `stress_tier` still describes loudness; the out-of-support state describes (un)trustworthiness.

**Analogs are presentation, never canonical.** `nearest_analogs` / `analog_status` never influence `display_state`. The canonical state derives solely from `validated_probability` (validated) or `stress_percentile` + `support` (stress). Analogs can be sparse, noisy, or fail — they translate the state for humans; they do not define it.

Every field is nullable / enum-defaulted so a future falsifiable severity rail (Branch B) or rehorizon contract (Option C) slots in without breaking consumers (see Future paths).

## Components & responsibilities

### Backend

1. **Version-stamped raw-score percentile reference (data dependency).**
   The stress percentile needs a historical raw-score distribution to rank against, and it **must be produced by the same estimator that serves live readings** or the percentile drifts silently. The live raw score comes from the *final* model (`xgb_transition`); the OOF raw scores come from the *per-fold* models — a different estimator. So the reference is **not** the OOF raw scores. Instead: score the full historical feature matrix with the **final model** (raw, pre-calibration) and persist that sorted raw-score vector as a reference artifact **stamped with the serving model's version**. In-sample optimism is harmless here because the percentile is a **rank** — monotonic inflation cancels under ranking. (Contrast: the reliability *table* stays OOF, because there we make a calibrated-probability claim where in-sample optimism would lie. Different job → different correct reference.)
   `build_risk_reading` checks the reference's version stamp against the loaded serving model; on mismatch it degrades to validated-only and logs a warning (see Error handling). Version consistency is mechanically enforced, not assumed.

2. **`stress_percentile(raw_score, raw_reference)`** — empirical percentile of a raw score within the (final-model, version-matched) historical raw-score reference. Pure function. Rank-preserving.

3. **`stress_tier(stress_percentile)`** — map percentile → `Elevated | High | Extreme` by **fixed** percentile cutpoints (ordinal only). Fixed (not distribution-aware) is the credible choice: outcome-rate anchoring is impossible above `max_evaluated_p` (outcome data is too sparse — the whole premise), and raw-tail-spacing anchoring would tie tiers to XGBoost split structure that shifts every retrain (same conditions could read "Extreme" then "High"). The percentile transform already supplies the distribution-relativity; the cutpoints on top stay fixed for cross-version stability. **Draft cutpoints: ≥0.85 Elevated / ≥0.97 High / ≥0.995 Extreme**, to be sanity-checked (not blind-locked) by an early plan task that prints tier-frequency histograms against the real raw distribution and the scenario-reachable range, then adjusted once. Rare "Extreme" (~tens of the most alarming days in 30y) is a feature, not a bug.

4. **Support classification** — reuse `src/evaluation/support_distance.py` (`nn_distance`, `SCENARIO_BASELINE_FEATURES`) to compute `nn_z_distance` for the reading's condition vector against the historical reference; `in_support = nn_z_distance <= z_threshold`.

5. **`build_risk_reading(raw_score, calibrated_p, condition_vector, reference) -> RiskReading`** — the single assembler. Computes both primitives, derives `display_state`, attaches analogs (via existing `find_analogs`) only when `stress_in_support`. Used by both the current-state and scenario serving paths.

6. **Serving paths** — current-state and scenario responses embed `RiskReading`. Both already have the raw model output available at serve time (the model produces raw; the calibrator produces calibrated) — expose the raw score to the assembler instead of discarding it.

### Frontend

1. **Replace `reliability.ts` heuristics with contract consumption.** Delete the frontend `MIN_N` / `out_of_range` re-derivation; render off `display_state`. `reliability.ts` keeps only the validated-zone track-record formatting (which legitimately uses the reliability bins).

2. **Three render treatments**, switched on `display_state`:
   - `validated` → calibrated probability + reliability line (unchanged from today).
   - `stress_in_support` → **no percent**; primary copy = analogs ("alarm at a level last seen in …"); secondary = tier + "more extreme than X% of historical readings — ranks severity, not odds."
   - `stress_out_of_support` → **no percent**; headline = "No historical analog — inputs Nσ beyond anything observed"; tier shown, strongest disclaimer; no analogs.

3. **Scope: Scenario Explorer first — hard boundary.** Scenario Explorer is where the misleading 76% lives and the only surface that regularly reaches out-of-support, so it gets the **full** three-state treatment in v1. Current State, in this workstream, gets **only**: (a) consume `RiskReading`, (b) render the `validated` treatment exactly as today, (c) delegate the rare stress/out-of-support case to the **shared** stress component built for Scenario Explorer. There is **no bespoke Current State stress UI and no Current State redesign** in this project. Because Current State is `validated` on essentially every real day, a tailored stress design there would be dead code; the shared-component fallback is the correct v1 tradeoff and is permitted to render *functional, not polished* in Current State's layout. This boundary is explicit so the workstream cannot drift into a Current State redesign.

## Data flow

```
panel → build_features → raw model.predict_proba ─┬─→ raw_score ──→ stress_percentile ─┐
                                                  └─→ calibrator ─→ calibrated_p ──────┤
condition_vector ─→ support_distance.nn_distance ─→ nn_z_distance ─→ in_support ───────┤
                                                                                       ▼
                                          build_risk_reading → RiskReading → API response → frontend render
final-model raw-score reference (version-stamped) ─────────────────────────────────────^ (percentile reference)
historical condition vectors ─────────────────────────────────────────────────────────^ (support reference + analogs)
```

## Error / edge handling

- **Missing reference** (artifact not yet built): `build_risk_reading` falls back to `validated`-only behaviour and logs a warning; no stress percentile is fabricated. Surfaces as "build raw-score reference" in ops.
- **Version mismatch** (reference stamp ≠ loaded serving model version): same degrade-to-validated-only + warn. Percentile is never computed against a reference from a different estimator.
- **Empty / degenerate reference** (n too small): treat percentile as unavailable → `stress_percentile = null`, tier null, but `display_state` still set from the support + ceiling primitives (so out-of-support is still flagged).
- **Calibrated p exactly at boundary** (`p == max_evaluated_p`): `validated` (boundary inclusive on the validated side, matching `_max_evaluated_p` semantics).
- **No analogs found** while `stress_in_support`: `analog_status = "unavailable"`, `nearest_analogs = null`; frontend degrades copy to percentile + tier only; do not invent analogs.

## Testing strategy

- **Pure functions** (`stress_percentile`, `stress_tier`, support classification, `display_state` derivation) — unit tests with synthetic reference distributions; assert rank-preservation, the 2×2 precedence table (all four cells incl. out-of-support-low-p), and boundary-inclusive validated.
- **`build_risk_reading`** — table-driven test over the 2×2 asserting exact field nullability per state, that `analog_status` is `available`/`unavailable` only in `stress_in_support` (else `not_applicable`), and that `nearest_analogs` is set iff `analog_status == "available"`.
- **Version stamp** — a test that a reference stamped with a different model version degrades to `validated`-only and warns (no percentile against a mismatched estimator).
- **Serving** — API smoke: scenario at maxed sliders returns `stress_out_of_support` with `validated_probability = null` and no fabricated percent; a normal live day returns `validated`.
- **Frontend** — render tests per `display_state` asserting **no `%` string appears** in either stress treatment, and that out-of-support shows the "no historical analog" headline.
- **Regression guard** — a test asserting `frontend/src/lib/reliability.ts` no longer hardcodes `MIN_N` / re-derives `out_of_range` (single-source-of-truth lock).

## Non-goals / future paths (explicitly preserved)

- **Not rehorizoning.** 5-day stays. The diagnostic showed the only "headroom" is base-rate inflation, not model skill (flat ~2.2x lift across horizons). **Option C / rehorizon to a ~month-scale signal remains a valid future branch** if we later decide on product grounds that the headline should mean "next month" rather than "next week"; the `RiskReading` contract is forward-compatible with that change (the calibrated-probability field simply re-binds to a longer-horizon model).
- **Not building the severity rail yet.** A separate falsifiable model on observable forward realized-vol / drawdown is the cleanest long-term way to honestly differentiate the out-of-support high end. It is deferred until two-zone honesty ships and we can judge whether it is sufficient on its own. The contract reserves room: a future `severity_rail` field slots beside `stress_percentile` without breaking consumers.
- Not changing the regime taxonomy, calibration method, or walk-forward config.

## Open parameters to fix in the plan

- `stress_tier` cutpoints: **fixed bands, draft ≥0.85 / ≥0.97 / ≥0.995**, sanity-checked against the real raw-score distribution + scenario-reachable range in an early plan task (tier-frequency histogram), then locked.
- `z_threshold` for `in_support` (Prong-2 diagnostic used 3.0; confirm or tighten).
- Number of `nearest_analogs` surfaced (proposed 2–3).
