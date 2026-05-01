# Model Drivers Page Redesign

**Date:** 2026-05-01  
**Status:** Approved — ready for implementation

---

## Summary

Redesign `frontend/src/pages/ModelDrivers.tsx` from two stacked panels (global importance above, local SHAP below) to a newspaper-front-page layout that leads with a plain-English narrative and surfaces technical depth progressively.

The primary audience is a visitor who does not already know XGBoost or SHAP. Every piece of technical content must be translated into plain English before it is shown.

---

## Layout Overview

```
┌────────────────────────────────────────────────────────┐
│ Topbar: "Model Drivers" · "What is driving today's     │
│         risk reading?"                 [● LIVE] [↻]    │
├────────────────────────────────────────────────────────┤
│ HERO BLOCK (full-width)                                │
│   Eyebrow: date + "Today's reading"                    │
│   Headline: dynamic, generated per regime transition   │
│   Body: 2–3 sentence case brief (regime, what model    │
│          is worried about, why risk is not lower)      │
│   Right stat: large risk %, "Weekly transition risk",  │
│               "Chance conditions worsen this week",    │
│               regime pill                              │
├─────────────────────────┬──────────────────────────────┤
│ WHY TODAY (left)        │ WHAT ALWAYS MATTERS (right)  │
│ Plain-English push/pull │ Global importance bars       │
│ bullets from SHAP       │ with human labels            │
│                         │ + "always vs. today" note    │
├────────────────────────────────────────────────────────┤
│ WHAT WOULD RAISE RISK FURTHER (full-width, purple)     │
│ 3 forward-looking plain-English bullets                │
├────────────────────────────────────────────────────────┤
│ ▸ Model reliability and threshold tradeoffs [collapsed]│
│   Threshold table + plain-English reading guide        │
└────────────────────────────────────────────────────────┘
```

---

## Data Sources

The page combines data from two existing hooks — no new API endpoints needed.

| Hook | Data used |
|------|-----------|
| `useCurrentState()` | `regime`, `transition_risk`, `as_of_ts`, `mode` |
| `useModelDrivers()` | `local_explanation` (SHAP), `global_importance`, `threshold_sweep` |

---

## Component Breakdown

### 1. `ModelDrivers.tsx` (page, full rewrite)

Calls both hooks. Assembles hero narrative and push/pull bullets from live data. Renders five sections in order.

**New helper needed:** `buildDriversNarrative(regime, transitionRisk, topPushingFeature)` in `frontend/src/lib/narratives.ts` — returns a 2–3 sentence string. Follows the same pattern as `buildCurrentStateNarrative`. Must use plain-English feature labels (`labelFor()`), not raw feature keys.

### 2. Hero block

Props: `regime`, `transitionRisk`, `asOfTs`, `narrative` (string)

- Eyebrow: formatted date + "Today's reading"
- Headline: chosen from `DRIVER_HEADLINES` lookup keyed on `(prevRegime, currentRegime)` pairs — see Narrative section below
- Body: `narrative` string
- Right stat: `transitionRisk` formatted as `XX%`, label "Weekly transition risk", sub-label "Chance conditions worsen this week", regime pill

The hero does **not** need to be its own file — inline in `ModelDrivers.tsx` is fine given its specificity.

### 3. Push/Pull panel (left column)

Derives bullets from `local_explanation`:
- `pushing` = entries with `value > 0`, sorted by `|value|` desc, top 3
- `holding` = entries with `value < 0`, sorted by `|value|` desc, top 3

Each bullet is a short plain-English sentence using `labelFor(feature)`. The sentence structure should be natural, not a label dump. For example:

- "SPY pulled back from its 2-year high" — not "drawdown_from_52w_high: +62%"
- "Day-to-day price swings are low" — not "realized_vol_5d: −25%"

Sentence templates live in `frontend/src/lib/featureLabels.ts` alongside the existing `labelFor()` map. Add a `sentenceFor(feature, direction: 'up' | 'down'): string` function that returns a complete plain-English sentence for the top drivers.

If `local_explanation` is empty, show a short fallback message ("Today's SHAP values are unavailable — showing global importance instead") and skip the push/pull section.

### 4. Global importance panel (right column)

Reuses existing `DriverBar` component. Shows top 5 by importance. Below the bars, add a two-line note:

> "Left panel shows *what is happening today*. This panel shows *what the model generally relies on most*."

### 5. "What would raise risk further" block

Static per-feature content derived from `topPushingFeature` (the highest-SHAP feature today). Three bullets:
1. If `realized_vol` or `vix` family: "More day-to-day volatility — if realized vol climbs past its historical median, it becomes the model's strongest signal"
2. If `drawdown` family: "A deeper pullback from recent highs"
3. General: "More frequent stress days in the next few weeks — a pickup here would push the trailing-month count higher"

These are conditionally rendered based on which features appear in `pushing`. If pushing is empty, render the three generic bullets above.

### 6. Reliability accordion (collapsed by default)

Uses React `useState` for open/close. Label: "▸ Model reliability and threshold tradeoffs". Sub-label: "How often does flagging at different risk levels actually catch regime shifts?"

When open, renders `threshold_sweep` from `useModelDrivers()` as a table with columns: Alert threshold, Shifts caught, Avg. days early, False alarm rate. Below the table, a plain-English reading guide (static copy, see mockup).

If `threshold_sweep` is empty, hide the accordion entirely.

---

## Narrative Logic

### Headline selection

The headline is chosen based on the current regime state. Add a small lookup in `narratives.ts`:

```ts
const DRIVER_HEADLINES: Record<string, string> = {
  calm:      "Markets just turned calm — but the model isn't ready to stand down",
  elevated:  "Elevated stress — the model is watching several warning signs",
  turbulent: "Turbulent conditions — the model sees significant risk signals",
}
```

Keyed on `regime.toLowerCase()`. If the regime just transitioned (determined by comparing `data.regime` on current state vs. prior state — already available via `data.delta.regime_changed`), prepend "Just shifted: " to provide context. This is optional polish; if it adds complexity, skip it for v1.

### `buildDriversNarrative` function

Signature: `buildDriversNarrative(regime: string, risk: number, topPushing: string[], topHolding: string[]): string`

Logic:
1. Open with regime + state summary (e.g., "After a stretch of elevated stress, conditions shifted to calm today")
2. If risk > 0.40: note what the model is watching (top pushing feature in plain English)
3. If risk < 0.20 and regime is calm: affirm stability ("Conditions look genuinely quiet — the model sees few stress signals")
4. Close with why risk is not lower/higher: reference top holding feature if risk is elevated

Uses `labelFor()` for all feature references. No raw feature keys in output. No SHAP/XGBoost terminology.

---

## Vocabulary Rules

Applied throughout this page:

| Never say | Say instead |
|-----------|-------------|
| SHAP value | "how much this factor is pushing risk" |
| feature importance | "how much the model relies on this" |
| XGBoost | omit |
| regime classifier | "market stress model" |
| percentile | "relative to its history" |
| calibrated probability | "estimated chance" |

---

## What Does NOT Change

- `useModelDrivers` hook — no changes
- `useCurrentState` hook — no changes
- `/model-drivers` API endpoint — no changes
- `DriverBar` component — reused as-is
- `featureLabels.ts` `labelFor()` — extended (add `sentenceFor`), not replaced
- `ThresholdSweepRow` type — reused as-is
- `_sync_snapshots()` in `state.py` — already implemented; called after every successful live refresh. No changes needed.

---

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/pages/ModelDrivers.tsx` | Full rewrite |
| `frontend/src/lib/narratives.ts` | Add `buildDriversNarrative`, `DRIVER_HEADLINES` |
| `frontend/src/lib/featureLabels.ts` | Add `sentenceFor(feature, direction)` |

No new files. No backend changes. No new components (hero and accordion are inline in the page).

---

## Visual Design

Follows existing dark cinematic brand exactly:
- `#060912` page background
- `#0c1520` / `#1e3a5f` hero card (blue tint — signals "information")
- `#080b12` / `#151d2e` standard panel
- `#0d0b18` / `#2e1d48` forward-looking block (purple tint — signals "forward-looking")
- Regime pill: same green/amber/red as rest of app
- Risk number: `#f87171` when risk > 0.40, `#fbbf24` when 0.20–0.40, `#4ade80` below 0.20
- All font sizes, weights, and spacing carry forward from existing panels

---

## Out of Scope

- Animations beyond existing framer-motion fade-in
- Saving or sharing the page state
- Comparison against prior days
- Retraining or changing the model
