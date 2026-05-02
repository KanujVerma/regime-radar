# Scenario Explorer Redesign — Implementation Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the saturating RiskRail with a Probability Tripod, add a verdict sentence, connect the threshold panel to the active scenario, add sensitivity dots to sliders, expand presets to 5 meaningfully-distinct scenarios, and improve the driver explanation with baseline→scenario values and an offsetting factor callout.

**Architecture:** Pure frontend change — no backend modifications needed. All new logic derives from data already returned by the existing `/scenario` and `/model-drivers` endpoints. One new component (`ProbabilityTripod`), one new exported function in `narratives.ts` (`buildScenarioVerdict`), updates to `sliderConfig.ts`, and a major rework of `ScenarioExplorer.tsx`.

**Tech Stack:** React 18, TypeScript, Framer Motion, Tailwind CSS (inline style pattern used throughout)

---

## Pre-implementation verification notes

These facts were confirmed by reading the live code before writing this spec. Implementers should not re-verify them; they are stated for clarity.

### `baseline_inputs` is confirmed to exist

`routes.py` lines 337–338 build and return `baseline_inputs` as a `dict[str, float]` containing rounded current-market values for all 6 slider features (`vix_level`, `vix_chg_5d`, `rv_20d_pct`, `drawdown_pct_504d`, `ret_20d`, `dist_sma50`). It is included in `ScenarioResponse` and typed in `frontend/src/types/api.ts`. **No backend change is required.** `data.baseline_inputs[feature]` is safe to use directly.

### `driver_deltas` offsetting factor — honest assessment

`routes.py` lines 318–335: driver deltas are computed as `delta_val = scenario_value - baseline_value` for all 6 slider overrides, then ranked by `abs(delta_val × importance)`. A delta is **negative** when the scenario slider is *below* baseline for that feature.

**Consequence for the offsetting factor UI:**

All 5 presets push every slider in one direction simultaneously (calm presets push all toward calm; stress presets push all toward stress). No preset will produce a mixed-sign delta list. The offsetting factor section will only appear during **manual slider exploration** — e.g., the user raises VIX to 35 but moves the 20-day return to a positive value. This is correct and expected behavior. **Do not force the section to appear for presets** — it should simply not render when the signal is absent. The spec's condition handles this naturally (see "Offsetting factor" section below).

### Preset distinctiveness — honest assessment

The regime model labels are primarily based on `rv_20d_pct` (realized vol percentile) and `drawdown_pct_504d` (drawdown relative to 2-year history). VIX is a predictor but not the labeling criterion.

**Volatility Pickup vs Growth Scare** should produce clearly distinct tripod outputs — RV 0.55 + drawdown 8% vs RV 0.72 + drawdown 20% is a meaningful separation.

**Panic Shock vs Slow Deterioration** may produce very similar tripod values (both likely ~95-99% non-calm). This is acceptable and intentional. The tripod shows probability distribution; the verdict sentence carries the narrative distinction via character detection (fast spike vs slow grind). If both show 97% non-calm, the sentence for Panic Shock reads "sharp event" and for Slow Deterioration reads "grinding deterioration." The two visualizations work together.

---

## File map

| File | Action | Notes |
|------|--------|-------|
| `frontend/src/components/charts/ProbabilityTripod.tsx` | **Create** | New component, replaces RiskRail in ScenarioExplorer |
| `frontend/src/lib/narratives.ts` | **Modify** | Add `buildScenarioVerdict()` — do not modify existing functions |
| `frontend/src/lib/sliderConfig.ts` | **Modify** | Replace 3 presets with 5; rename keys |
| `frontend/src/pages/ScenarioExplorer.tsx` | **Modify** | Major rework — all new panels wired here |

`RiskRail.tsx` is **not deleted** — kept in place, just no longer used in ScenarioExplorer.

No meta-commentary, explanatory footer copy, or "Design decisions explained" sections from the mockup should appear in any shipped UI. The mockup was for brainstorming; the product page should not explain its own redesign rationale to users.

---

## Background: why the RiskRail saturates

The regime classifier outputs three probabilities: `prob_calm`, `prob_elevated`, `prob_turbulent`. The current RiskRail uses `1 - prob_calm` as a single headline number. Both the Choppy preset (VIX 28) and the Stress Spike preset (VIX 45) push `1 - prob_calm` to ~99.8%, making them visually identical on the rail. The nuance that distinguishes them — elevated 99.5% vs turbulent 2.4% — is only visible in the per-regime bars, which are secondary UI.

The fix: surface all three probabilities simultaneously as the primary headline visualization. The tripod *is* the primary regime-state summary. The `1 - prob_calm` number is secondary supporting context.

---

## Component: `ProbabilityTripod`

**File:** `frontend/src/components/charts/ProbabilityTripod.tsx`

**Props:**
```ts
interface ProbabilityTripodProps {
  baselineCalm: number
  baselineElevated: number
  baselineTurbulent: number
  scenarioCalm: number
  scenarioElevated: number
  scenarioTurbulent: number
}
```

**Behavior:**
- Render three animated tiles side by side: Calm (green `#4ade80`) / Elevated (amber `#fbbf24`) / Turbulent (red `#f87171`)
- Each tile shows: `baseline%` (dimmed, small) → `scenario%` (large, bold) and the delta in pp (e.g., `+14pp`, `-14pp`, `no change` if |delta| < 0.5pp)
- A thin (4px) progress bar at the bottom of each tile fills to `scenario%` width using the tile's color
- The **dominant** tile (highest `scenario` value) gets a 1.5px solid border in its main color instead of the default muted border, and a small `DOMINANT` pill label (7px uppercase, same color, top-right corner of the tile)
- Use `framer-motion` `<motion.div>` animated via `animate={{ width: \`${scenarioPct}%\` }}` for the bar fill with `transition={{ type: 'spring', stiffness: 200, damping: 25 }}`

**Dominant logic:**
```ts
const dominant = scenarioCalm >= scenarioElevated && scenarioCalm >= scenarioTurbulent
  ? 'calm'
  : scenarioElevated >= scenarioTurbulent
  ? 'elevated'
  : 'turbulent'
```

**Tile colors / styles** (dark theme):
```
Calm tile:     bg #071410,  default border #0e2e20,  dominant border 1.5px solid #4ade80
Elevated tile: bg #130f02,  default border #78350f,  dominant border 1.5px solid #fbbf24
Turbulent tile: bg #0e0505, default border #2d0e0e,  dominant border 1.5px solid #f87171
Baseline number: 40% opacity of tile's main color (achieved via inline opacity or hex alpha)
Arrow →:       #1e293b (dim)
```

---

## Function: `buildScenarioVerdict`

**File:** `frontend/src/lib/narratives.ts` — add as new export; do not modify existing functions.

**Signature:**
```ts
export interface ScenarioVerdictResult {
  badgeLabel: string
  badgeColor: string
  badgeBg: string
  badgeBorder: string
  sentence: string
}

export function buildScenarioVerdict(
  probCalm: number,
  probElevated: number,
  probTurbulent: number,
  topDriverLabel: string,
): ScenarioVerdictResult
```

Note: `inputs` is **not** a parameter. The inputs were used in the previous spec draft as a crutch to distinguish scenarios that the tripod couldn't separate. The updated approach uses a separate `detectScenarioCharacter` helper that is called by the consumer (ScenarioExplorer.tsx) and passes only what's needed.

**Step 1 — Determine severity tier** (based on tripod output only):

```ts
type SeverityTier = 'calm' | 'stress-building' | 'elevated' | 'strongly-elevated' | 'turbulent-emerging'

function getSeverityTier(
  probCalm: number,
  probTurbulent: number,
): SeverityTier {
  if (probCalm >= 0.70)                              return 'calm'
  if (probCalm >= 0.40)                              return 'stress-building'
  if (probCalm >= 0.15 && probTurbulent < 0.02)      return 'elevated'
  if (probCalm < 0.15  && probTurbulent < 0.02)      return 'strongly-elevated'
  return 'turbulent-emerging'  // probTurbulent >= 0.02
}
```

Thresholds are intentionally coarse (not 0.1795 or similar). Minor probability fluctuations from slider adjustments should not cause the badge to flip constantly.

**Step 2 — Detect scenario character** (inputs as flavor only; called by ScenarioExplorer, not by buildScenarioVerdict):

```ts
type ScenarioCharacter = 'sharp-shock' | 'slow-grind' | 'neutral'

export function detectScenarioCharacter(inputs: ScenarioInputs): ScenarioCharacter {
  if (inputs.vix_chg_5d >= 5 && inputs.ret_20d <= -0.07) return 'sharp-shock'
  if (inputs.vix_chg_5d <= 2 && inputs.drawdown_pct_504d >= 0.25) return 'slow-grind'
  return 'neutral'
}
```

Requires both conditions (not just one) to avoid false positives.

**Step 3 — Generate verdict** (`buildScenarioVerdict` signature above takes `topDriverLabel` only; character is passed separately via the full signature below):

Full internal signature used in the implementation:
```ts
// ScenarioExplorer.tsx calls this version
export function buildScenarioVerdict(
  probCalm: number,
  probElevated: number,
  probTurbulent: number,
  topDriverLabel: string,
  character?: ScenarioCharacter,
): ScenarioVerdictResult
```

Verdict table by severity tier:

| Tier | Badge | Sentence template |
|------|-------|-------------------|
| `calm` | "Calm" | "Conditions remain calm under this scenario. The model sees no meaningful stress signal." |
| `stress-building` | "Mild stress" | "Calm is still the most likely outcome, but stress conditions are starting to build. [topDriverLabel] is the main factor weighing on the model." |
| `elevated` (sharp-shock) | "Elevated stress" | "This looks like a sharp stress event — elevated conditions are dominant. Calm has receded but turbulent probability remains contained." |
| `elevated` (slow-grind) | "Elevated stress" | "This scenario is mostly Elevated rather than Turbulent — more of a slow deterioration than a sudden shock. [topDriverLabel] is the primary driver." |
| `elevated` (neutral) | "Elevated stress" | "This scenario is mostly Elevated rather than Turbulent. Calm has receded and elevated conditions are dominant." |
| `strongly-elevated` | "High stress" | "Calm has largely left the picture under this scenario. Elevated conditions are heavily dominant — [topDriverLabel] is driving the stress reading." |
| `turbulent-emerging` | "Elevated + turbulent" | "Turbulent risk is beginning to emerge alongside elevated stress. [topDriverLabel] is pushing conditions toward a more severe stress classification." |

**Badge colors:**
```
"Calm":                color #4ade80, bg #0f2a1a, border #14532d
"Mild stress":         color #06b6d4, bg #051820, border #0e3d55
"Elevated stress":     color #fbbf24, bg #1a1505, border #78350f
"High stress":         color #f97316, bg #1a0c03, border #7c2d12
"Elevated + turbulent": color #f87171, bg #1a0505, border #7f1d1d
```

**Null/undefined safety:** If any of `probCalm`, `probElevated`, `probTurbulent` is `null`, `undefined`, or `NaN`, return:
```ts
{ badgeLabel: 'Unavailable', badgeColor: '#475569', badgeBg: '#0c1020', badgeBorder: '#1e293b',
  sentence: 'Scenario data is not available yet.' }
```
Never silently default to "Calm" — that implies false reassurance.

---

## Updated presets

**File:** `frontend/src/lib/sliderConfig.ts`

Replace the `PRESETS` object. Keep the `ScenarioInputs` type unchanged. Change keys from `calm/choppy/stress` to:

```ts
export const PRESETS: Record<string, ScenarioInputs> = {
  calm_recovery: {
    vix_level: 13, vix_chg_5d: -1.0, rv_20d_pct: 0.20,
    drawdown_pct_504d: 0.02, ret_20d: 0.03, dist_sma50: 0.02,
    days_in_regime_lag1: 60, turbulent_count_30d_lag1: 0,
  },
  volatility_pickup: {
    vix_level: 22, vix_chg_5d: 4.0, rv_20d_pct: 0.62,
    drawdown_pct_504d: 0.10, ret_20d: -0.02, dist_sma50: -0.01,
    days_in_regime_lag1: 10, turbulent_count_30d_lag1: 1,
  },
  growth_scare: {
    vix_level: 24, vix_chg_5d: 2.0, rv_20d_pct: 0.72,
    drawdown_pct_504d: 0.20, ret_20d: -0.05, dist_sma50: -0.04,
    days_in_regime_lag1: 8, turbulent_count_30d_lag1: 3,
  },
  panic_shock: {
    vix_level: 45, vix_chg_5d: 10.0, rv_20d_pct: 0.95,
    drawdown_pct_504d: 0.65, ret_20d: -0.15, dist_sma50: -0.10,
    days_in_regime_lag1: 2, turbulent_count_30d_lag1: 3,
  },
  slow_deterioration: {
    vix_level: 28, vix_chg_5d: 1.0, rv_20d_pct: 0.78,
    drawdown_pct_504d: 0.45, ret_20d: -0.08, dist_sma50: -0.06,
    days_in_regime_lag1: 25, turbulent_count_30d_lag1: 6,
  },
}
```

Note: `volatility_pickup` was adjusted from the first draft (VIX 22, vix_chg 4.0, RV 0.62, drawdown 0.10) to ensure it reads as genuinely elevated-starting vs calm_recovery, not ambiguously calm. Expected tripod behavior across all 5 presets:

| Preset | Expected dominant | Expected calm range | Notes |
|--------|------------------|---------------------|-------|
| calm_recovery | calm | ~85-95% | clear calm verdict |
| volatility_pickup | calm or mixed | ~45-65% | stress-building verdict |
| growth_scare | elevated | ~25-40% | elevated verdict |
| panic_shock | elevated | ~2-8% | high stress or turbulent-emerging verdict |
| slow_deterioration | elevated | ~10-20% | strongly-elevated verdict |

If after implementation any preset produces a verdict that doesn't match its name, adjust the preset values rather than the verdict logic.

**Preset button labels** (in ScenarioExplorer.tsx):
```ts
const PRESET_BUTTONS = [
  { id: 'calm_recovery',      icon: '🌤', label: 'Calm Recovery',      desc: 'Low vol, long calm streak' },
  { id: 'volatility_pickup',  icon: '📈', label: 'Volatility Pickup',  desc: 'VIX rising, still near highs' },
  { id: 'growth_scare',       icon: '📉', label: 'Growth Scare',       desc: 'Moderate selloff, vol elevated' },
  { id: 'panic_shock',        icon: '⚡', label: 'Panic Shock',        desc: 'Sharp VIX spike, deep drawdown' },
  { id: 'slow_deterioration', icon: '🐌', label: 'Slow Deterioration', desc: 'Grinding lower, no single spike' },
]
```

Each button: `icon + label` on one line, `desc` as 9px subtitle below in `#475569`. This is a layout change from current single-line buttons — the left panel will be slightly taller.

---

## Sensitivity dots on sliders

**Where:** Computed in `ScenarioExplorer.tsx` from `modelData?.global_importance` (already loaded via the existing `useModelDrivers()` call).

**Logic:**
```ts
const SLIDER_KEYS = ['vix_level', 'vix_chg_5d', 'rv_20d_pct', 'drawdown_pct_504d', 'ret_20d', 'dist_sma50'] as const

function getSliderSensitivity(
  key: string,
  globalImportance: { feature: string; importance: number }[] | undefined,
): 'high' | 'medium' | 'low' {
  if (!globalImportance) return 'low'
  // Filter to slider features only — non-slider features (e.g., days_in_regime_lag1)
  // can have high importance and would otherwise skew slider ranks misleadingly.
  const ranked = [...globalImportance]
    .filter(d => (SLIDER_KEYS as readonly string[]).includes(d.feature))
    .sort((a, b) => b.importance - a.importance)
  const idx = ranked.findIndex(d => d.feature === key)
  if (idx === -1) return 'low'
  if (idx <= 1)   return 'high'    // top 2 slider features by model importance
  if (idx <= 3)   return 'medium'  // slider features 3–4
  return 'low'
}

const SENSITIVITY_COLORS: Record<'high' | 'medium' | 'low', string> = {
  high:   '#f87171',
  medium: '#fbbf24',
  low:    '#475569',
}
```

**Rendering:**
- In each slider row, render a 6×6px filled circle (border-radius 50%) to the left of the label text, using `SENSITIVITY_COLORS[sensitivity]`. No tooltip needed — the legend above provides context.
- Render a one-line legend once, above the slider section:
  `● High  ● Med  ● Low  MODEL WEIGHT` — 8px text, `#475569`
- If `modelData` is not yet loaded, render all dots grey (`#475569`) — no loading spinner, just degrade gracefully.

---

## Updated driver explanation

**Where:** `ScenarioExplorer.tsx` — replace the "What changed the most" panel.

**Panel title:** Change to "What's driving this scenario"

### Ranked drivers

For each entry in `data.driver_deltas` (already sorted by `|delta_value × importance|`):

1. Show `#1`, `#2`, `#3` rank label to the left (10px bold)
2. Show `plain_label` (feature name)
3. Below the feature name, if `data.baseline_inputs[d.feature]` exists:
   - Compute `baselineVal = data.baseline_inputs[d.feature]`
   - Compute `scenarioVal = baselineVal + d.delta_value`
   - Render: `baselineVal.toFixed(1) → scenarioVal.toFixed(1)` in 9px `#475569`
   - Use 1 decimal place — not toFixed(4), which is over-precise for a non-expert audience
   - Exception: if the value is a percentile (rv_20d_pct, drawdown_pct_504d), format as percentage: `(baselineVal * 100).toFixed(0)% → (scenarioVal * 100).toFixed(0)%`
4. Show the delta on the right: `+0.12` or `-0.03` (keep 2 decimal places for the delta itself, it conveys relative magnitude)

### Offsetting factor

Show this section only when **all three conditions** are true:
1. `data.driver_deltas.length > 0`
2. `data.driver_deltas[0].delta_value > 0` (primary driver is pushing stress up)
3. At least one entry in `data.driver_deltas` has `delta_value < 0`

When shown, find the first entry in `driver_deltas` where `delta_value < 0`. Render it as a separate row below the ranked drivers:

```
↓ [plain_label]  (partially offsetting)
  [plain_label] is limiting how stressed this scenario becomes.
```

Use 9px text, color `#4ade80` for the ↓ indicator and label. The description sentence uses `#475569`. Do not make causal claims — frame it as "limiting how stressed the scenario becomes", not "preventing a worse outcome."

The offsetting factor will not appear for the 5 presets (they push all sliders in one direction). It appears during manual exploration when the user creates genuine tension (e.g., high VIX but positive return). This is correct and expected — the UI should not force the section to appear when the signal is absent.

---

## Alert threshold connection

**Where:** `ScenarioExplorer.tsx` — inside the existing threshold section.

**Placement:** Place the status block **between** the threshold slider and the sweep stats grid.

**Derivation:**
```ts
const scenarioStress = data ? 1 - data.prob_calm : null
const thresholdGap = scenarioStress != null ? scenarioStress - threshold : null
```

**Status block (rendered only when `data` is non-null):**

If `thresholdGap < 0` (below threshold):
- bg `#0f2a1a`, border `#14532d`, text `#4ade80`
- Line 1: "✓ This scenario stays below your alert threshold"
- Line 2 (9px `#475569`): `"Stress probability [X]% — [Y]pp below the [Z]% threshold"` where X = `(scenarioStress * 100).toFixed(0)`, Y = `Math.abs(thresholdGap * 100).toFixed(0)`, Z = `(threshold * 100).toFixed(0)`

If `thresholdGap >= 0` (crosses threshold):
- bg `#1a0505`, border `#7f1d1d`, text `#f87171`
- Line 1: "⚠ This scenario would cross your alert threshold"
- Line 2 (9px `#475569`): `"Stress probability [X]% exceeds the [Z]% threshold by [Y]pp"`

Also add a compact one-line alert pill inside the verdict block (see layout section) that says:
- "Below alert threshold" (green `#4ade80`, tiny pill)
- "Alert threshold crossed" (red `#f87171`, tiny pill)

The verdict block pill is a glanceable summary; the threshold section block is the detailed version. Both are derived from the same `thresholdGap` value.

---

## ScenarioExplorer.tsx layout changes

### Visual hierarchy principle

The **ProbabilityTripod is the primary regime-state visualization**. The non-calm number (`1 - prob_calm`) is a supporting stat — it stays visible but should not visually dominate over the tripod. In the verdict block, it appears as a small secondary number, not a 28-32px headline.

### Right column, top to bottom

**1. Verdict block** (replaces old RiskRail panel + old narrative panel)

Layout: single `div` or `Panel` with dark blue border (`border: 1px solid #1a3a5f`).
- Row 1: badge pill + dominant-regime label (see below)
- Row 2: verdict sentence (11px, `#94a3b8`, leading 1.6)
- Row 3: two small inline stats: `Non-calm: X%` and `Δ +Ypp vs current` in 9px `#64748b` — secondary context only
- Row 4: compact alert pill (1 line: "Below alert threshold" or "Alert threshold crossed")

Dominant-regime label: show the name of the dominant regime ("Calm", "Elevated", or "Turbulent") as a 9px uppercase label to the right of the badge, e.g.: `[Elevated stress badge] · Elevated dominant`. This helps users interpret the tripod at a glance before their eyes reach the tiles.

**2. ProbabilityTripod panel** (replaces both old RiskRail + per-regime bars panels)
- Panel title: "Regime probability — current market → your scenario"
- The per-regime bars panel is **removed**. The tripod already shows baseline→scenario per class; keeping both is redundant.

**3. Driver explanation panel** (updated per spec above)

### Left column

1. **Quick scenarios** — updated to 5-preset layout with subtitle descriptions
2. **Sensitivity legend** — new, rendered once above the slider section (8px, inline legend row)
3. **Sliders** — add sensitivity dots, no other slider changes
4. **Threshold section** — add scenario status block between threshold slider and sweep stats grid

---

## What's NOT changing

- `useScenario` hook — no changes
- `useModelDrivers` hook — no changes
- Backend `/scenario` or `/model-drivers` endpoints — no changes
- `RiskRail.tsx` component — kept, just not used in ScenarioExplorer
- Layout: two-column left/right split stays the same
- Topbar, reset button, `useRef` seeding logic, `currentMarketInputs` state — no changes
- `buildNarrative` and other functions in `narratives.ts` — untouched (add only, don't modify)

---

## Error handling

- `buildScenarioVerdict`: if any prob is `null`, `undefined`, or `NaN`, return `{ badgeLabel: 'Unavailable', sentence: 'Scenario data is not available yet.', ... }`. Never default to "Calm" — that implies false reassurance.
- `detectScenarioCharacter`: safe to call with any `ScenarioInputs` — no nulls possible (all 6 slider values are always present).
- Sensitivity dots: if `modelData` is not loaded, render grey dots (`#475569`) for all sliders.
- Offsetting factor: skip entirely if conditions are not met (see logic above).
- Threshold status: only render when `data` is non-null and `scenarioStress` is a valid number.
- Baseline→scenario values in driver section: if `data.baseline_inputs[d.feature]` is missing (feature key not in object), render only the delta without the `baseline → scenario` sub-line. Never throw.

---

## Testing

After implementation, manually verify these cases in the browser:

| Test | Expected |
|------|----------|
| Page loads fresh | Sliders auto-seed to live market values; tripod shows baseline ≈ scenario |
| Click "Calm Recovery" | Calm tile dominant; verdict badge = "Calm"; threshold status shows green |
| Click "Volatility Pickup" | Calm and elevated tiles show tension; verdict badge = "Mild stress" |
| Click "Growth Scare" | Elevated tile dominant; verdict = "Elevated stress" |
| Click "Panic Shock" | Elevated ~95%+ dominant; turbulent slightly higher than calm_recovery; verdict = "High stress" |
| Click "Slow Deterioration" | Similar non-calm to Panic Shock; verdict sentence mentions "slow deterioration" or "grinding" |
| Panic Shock vs Slow Deterioration | Tripod values may be similar; but verdict sentences are clearly distinct in character |
| Raise VIX to 35, keep ret_20d positive | If ret_20d delta < 0 conditions met: offsetting factor renders; otherwise it does not |
| All sliders to Panic Shock values manually | Offsetting factor does NOT appear (all deltas positive) |
| Threshold = 10%, any stress preset | Alert status block turns red; verdict block pill turns red |
| Threshold = 70% | All presets except Panic Shock stay green |
| Sensitivity dots | VIX Level and VIX 5-day Change show red dots (expected top-2 slider features by importance) |
| Driver section: Panic Shock | #1 driver shows VIX with "16.9 → 45.0" sub-line (values formatted to 1dp) |
| Driver section: drawdown as percentile | Shows "10% → 65%" not "0.10 → 0.65" |
| Non-calm number in verdict block | Appears as small secondary stat, not visually larger than the tripod tiles |
