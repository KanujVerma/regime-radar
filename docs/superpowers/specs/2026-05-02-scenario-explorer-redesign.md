# Scenario Explorer Redesign — Implementation Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the saturating RiskRail with a Probability Tripod, add a verdict sentence, connect the threshold panel to the active scenario, add sensitivity dots to sliders, expand presets to 5 meaningfully-distinct scenarios, and improve the driver explanation with baseline→scenario values and an offsetting factor callout.

**Architecture:** Pure frontend change — no backend modifications. All new logic derives from data already returned by the existing `/scenario` and `/model-drivers` endpoints. One new component (`ProbabilityTripod`), one new exported function in `narratives.ts` (`buildScenarioVerdict`), and updates to `sliderConfig.ts`, `ScenarioExplorer.tsx`.

**Tech Stack:** React 18, TypeScript, Framer Motion, Tailwind CSS (inline style pattern used throughout)

---

## Background: why the RiskRail saturates

The regime classifier outputs three probabilities: `prob_calm`, `prob_elevated`, `prob_turbulent`. The current RiskRail uses `1 - prob_calm` as a single headline number. Both the Choppy preset (VIX 28) and the Stress Spike preset (VIX 45) push `1 - prob_calm` to ~99.8%, making them visually identical on the rail. The nuance that distinguishes them — elevated 99.5% vs turbulent 2.4% — is only visible in the per-regime bars below, which are secondary UI.

The fix: surface all three probabilities as the primary headline visualization.

---

## File map

| File | Action | Notes |
|------|--------|-------|
| `frontend/src/components/charts/ProbabilityTripod.tsx` | **Create** | New component, replaces RiskRail in ScenarioExplorer |
| `frontend/src/lib/narratives.ts` | **Modify** | Add `buildScenarioVerdict()` |
| `frontend/src/lib/sliderConfig.ts` | **Modify** | Replace 3 presets with 5; rename keys |
| `frontend/src/pages/ScenarioExplorer.tsx` | **Modify** | Major rework — all new panels wired here |

`RiskRail.tsx` is **not deleted** — it may be used elsewhere or referenced in the future.

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
- Each tile shows: `baseline%` → `scenario%` and the delta in percentage points (e.g., `+14pp`, `-14pp`, `no change` if |delta| < 0.5pp)
- A thin progress bar at the bottom of each tile fills to `scenario%` width using the tile's color
- The **dominant** tile (highest `scenario` value) gets a slightly brighter border and a small `DOMINANT` label in the top-right corner
- Use `framer-motion` `<motion.div>` animated via `animate={{ width: scenarioPct }}` for the bar fill — `transition={{ type: 'spring', stiffness: 200, damping: 25 }}`

**Colors / styles** (match existing dark theme):
```
Calm tile bg:     #071410   border: #0e2e20
Elevated tile bg: #130f02   border: #78350f  (dominant: #fbbf24 border, brighter)
Turbulent tile bg: #0e0505  border: #2d0e0e
Baseline number color: 40% opacity of tile's main color
Arrow →:          #1e293b (dim)
```

**Dominant logic:**
```ts
const dominant = scenarioCalm >= scenarioElevated && scenarioCalm >= scenarioTurbulent
  ? 'calm'
  : scenarioElevated >= scenarioTurbulent
  ? 'elevated'
  : 'turbulent'
```

---

## Function: `buildScenarioVerdict`

**File:** `frontend/src/lib/narratives.ts` (add as new export, do not modify existing functions)

**Signature:**
```ts
export interface ScenarioVerdictResult {
  badgeLabel: string   // e.g. "Elevated stress"
  badgeColor: string   // CSS color for the badge text/border
  badgeBg: string      // CSS background for the badge
  sentence: string     // 1–2 sentence plain-English classification
}

export function buildScenarioVerdict(
  probCalm: number,
  probElevated: number,
  probTurbulent: number,
  topDriverLabel: string,   // plain_label of driver_deltas[0]
  inputs: ScenarioInputs,
): ScenarioVerdictResult
```

**Classification logic** (thresholds are probability fractions, not percentages):

| Condition | Badge | Sentence |
|-----------|-------|----------|
| `probCalm >= 0.80` | "Calm" | "Conditions remain calm under this scenario — the model sees no meaningful stress signal." |
| `probCalm >= 0.50` | "Mild stress" | "Elevated conditions are beginning to build. Calm is still the most likely outcome, but [topDriverLabel] is starting to weigh on the model." |
| `probCalm >= 0.25 && probTurbulent < 0.02` | "Elevated stress" | If `inputs.vix_chg_5d > 4`: "This looks like a fast-moving stress scenario — VIX is spiking sharply. Elevated regime dominant, turbulent probability remains contained." Else: "This resembles a slow deterioration — drawdown and vol are grinding higher rather than spiking. Elevated regime is dominant." |
| `probCalm < 0.25 && probTurbulent < 0.02` | "High stress" | "Calm has essentially left the picture. Elevated regime is heavily dominant — this is severe but vol-driven rather than a full panic." |
| `probTurbulent >= 0.02` | "Elevated + turbulent" | "Turbulent signals are emerging alongside elevated conditions. This resembles a sharper shock — both regimes are registering meaningfully." |

**Badge colors:**
```
"Calm":              color #4ade80, bg #0f2a1a, border #14532d
"Mild stress":       color #06b6d4, bg #051820, border #0e3d55
"Elevated stress":   color #fbbf24, bg #1a1505, border #78350f
"High stress":       color #f97316, bg #1a0c03, border #7c2d12
"Elevated + turbulent": color #f87171, bg #1a0505, border #7f1d1d
```

---

## Updated presets

**File:** `frontend/src/lib/sliderConfig.ts`

Replace the `PRESETS` object. Keep the `ScenarioInputs` type unchanged. Change keys from `calm/choppy/stress` to new names:

```ts
export const PRESETS: Record<string, ScenarioInputs> = {
  calm_recovery: {
    vix_level: 13, vix_chg_5d: -1.0, rv_20d_pct: 0.20,
    drawdown_pct_504d: 0.02, ret_20d: 0.03, dist_sma50: 0.02,
    days_in_regime_lag1: 60, turbulent_count_30d_lag1: 0,
  },
  volatility_pickup: {
    vix_level: 20, vix_chg_5d: 3.0, rv_20d_pct: 0.55,
    drawdown_pct_504d: 0.08, ret_20d: -0.01, dist_sma50: -0.01,
    days_in_regime_lag1: 12, turbulent_count_30d_lag1: 1,
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

**Preset button labels** (in ScenarioExplorer.tsx):
```ts
[
  { id: 'calm_recovery',     icon: '🌤', label: 'Calm Recovery',      desc: 'Low vol, long calm streak' },
  { id: 'volatility_pickup', icon: '📈', label: 'Volatility Pickup',  desc: 'VIX rising, still near highs' },
  { id: 'growth_scare',      icon: '📉', label: 'Growth Scare',       desc: 'Moderate selloff, vol elevated' },
  { id: 'panic_shock',       icon: '⚡', label: 'Panic Shock',        desc: 'Sharp VIX spike, deep drawdown' },
  { id: 'slow_deterioration',icon: '🐌', label: 'Slow Deterioration', desc: 'Grinding lower, no single spike' },
]
```

Each button shows `icon + label` on one line and `desc` as a small subtitle below (9px, `#475569`). This is a slight layout change from current single-line buttons.

---

## Sensitivity dots on sliders

**Where:** In `ScenarioExplorer.tsx`, compute from `modelData?.global_importance` (already loaded via `useModelDrivers`).

**Logic:**
```ts
const SLIDER_KEYS = ['vix_level', 'vix_chg_5d', 'rv_20d_pct', 'drawdown_pct_504d', 'ret_20d', 'dist_sma50']

function getSliderSensitivity(
  key: string,
  globalImportance: { feature: string; importance: number }[] | undefined,
): 'high' | 'medium' | 'low' {
  if (!globalImportance) return 'low'
  // rank among slider features only — non-slider features like days_in_regime_lag1
  // can have high importance and would otherwise push slider ranks down misleadingly
  const sliderImportances = [...globalImportance]
    .filter(d => SLIDER_KEYS.includes(d.feature))
    .sort((a, b) => b.importance - a.importance)
  const idx = sliderImportances.findIndex(d => d.feature === key)
  if (idx === -1) return 'low'
  if (idx <= 1) return 'high'    // top 2 slider features
  if (idx <= 3) return 'medium'  // slider features 3–4
  return 'low'
}

const SENSITIVITY_COLORS = {
  high:   '#f87171',
  medium: '#fbbf24',
  low:    '#475569',
}
```

**Rendering:** In each slider row, render a 6×6px dot (border-radius 50%) to the left of the label using `SENSITIVITY_COLORS[sensitivity]`. Add a legend once above the slider section:

```
● High   ● Med   ● Low   MODEL WEIGHT
```

(9px text, `#475569`, right-aligned or inline with section header)

---

## Updated driver explanation

**Where:** `ScenarioExplorer.tsx` — the "What changed the most" panel.

**Changes:**

1. **Add baseline → scenario values** for each driver row, using `data.baseline_inputs`:
   - `baselineVal = data.baseline_inputs[d.feature] ?? null`
   - `scenarioVal = baselineVal != null ? baselineVal + d.delta_value : null`
   - Below the feature name, render `baselineVal.toFixed(2) → scenarioVal.toFixed(2)` in 9px `#475569` if values are available

2. **Rank labels:** Show `#1`, `#2`, `#3` to the left of each driver row (10px, bold, colored by severity of delta — red for increases, green for decreases)

3. **Offsetting factor:** After the ranked drivers, check for any `driver_delta` where `delta_value < 0` AND the top drivers are all positive. If found, show a separate row at the bottom:
   ```
   ↓ [feature plain_label] (partially offsetting)
   [sentence explaining it's limiting the stress]
   ```
   The sentence: `"${d.plain_label} moved from ${baselineVal.toFixed(2)} to ${scenarioVal.toFixed(2)}, which is partially buffering the model's stress reading."`
   
   Only show this if: at least one positive driver exists AND at least one negative driver exists in `driver_deltas`. If all deltas are positive (pure stress scenario), omit the section.

4. **Panel title change:** "What changed the most" → "What's driving this scenario"

---

## Alert threshold connection

**Where:** `ScenarioExplorer.tsx` — inside the existing threshold section, below the sweep stats grid.

**Add a status block:**
```ts
const scenarioStressVsThreshold = data ? (1 - data.prob_calm) - threshold : null
```

Show a colored status block (rounded, 7px border-radius, 8px 10px padding):
- If `scenarioStressVsThreshold < 0`:
  - bg `#0f2a1a`, border `#14532d`, text `#4ade80`
  - Content: `"✓ Below threshold"`
  - Sub-text (9px, `#475569`): `"Stress probability {X}% — {Y}pp below the {Z}% threshold"` where X = `(1-data.prob_calm)*100` toFixed(0), Y = `Math.abs(scenarioStressVsThreshold)*100` toFixed(0), Z = `threshold*100` toFixed(0).
- If `scenarioStressVsThreshold >= 0`:
  - bg `#1a0505`, border `#7f1d1d`, text `#f87171`
  - Content: `"⚠ Threshold crossed — this scenario would trigger an alert"`
  - Sub-text: `"{(1-data.prob_calm)*100}% stress exceeds {threshold*100}% threshold"`

Place this block **between** the threshold slider and the sweep stats grid (not after — it reads as a consequence of the slider position).

---

## ScenarioExplorer.tsx layout changes

**Right column, top to bottom:**

1. ~~RiskRail panel~~ → **Verdict block** (new `Panel` or standalone `div` with `border: 1px solid #1a3a5f`)
   - Left: badge + sentence + alert pill (small, below sentence)
   - Right: large `(1-prob_calm)*100%` number with delta vs baseline
   
2. **ProbabilityTripod panel** (new, replaces both the old RiskRail panel and the per-regime bars panel)
   - Title: "Regime probability — current market → your scenario"
   - The per-regime bars panel is **removed**: the tripod already shows baseline→scenario per class via the `base% → scen%` text inside each tile; keeping both panels is redundant.

3. **Driver explanation panel** — updated per spec above

4. ~~Narrative panel~~ → **remove**. The verdict block replaces it. Do not keep both.

**Left column:**

1. **Quick scenarios** — update preset buttons to 5-preset layout with description subtitles
2. **Sensitivity legend** — new, above the sliders section
3. **Sliders** — add sensitivity dots, no other changes
4. **Threshold section** — add scenario status block between slider and sweep grid

---

## What's NOT changing

- `useScenario` hook — no changes
- `useModelDrivers` hook — no changes  
- Backend API — no changes
- `RiskRail.tsx` component — kept, just not used in ScenarioExplorer
- Layout: two-column left/right split stays the same
- Topbar, reset button, `useRef` seeding logic — no changes

---

## Error handling

- `buildScenarioVerdict`: if any prob is `null` or `undefined`, return the "Calm" verdict as safe default — the function should never throw
- Sensitivity dots: if `modelData` is not loaded yet, render grey dots for all sliders (degrade gracefully, no spinner)
- Offsetting factor: only render if `driver_deltas.length > 0`; skip if `baseline_inputs` is missing the feature key
- Threshold status: only render after `data` is non-null

---

## Testing

After implementation, manually verify these cases in the browser:

| Test | Expected |
|------|----------|
| Load page fresh | Sliders auto-seed from live market; tripod shows baseline = scenario initially |
| Click "Calm Recovery" | All three tripod tiles show calm dominant (~80%+); verdict badge = "Calm" |
| Click "Panic Shock" | Elevated tile dominant; turbulent shows small but visible uptick vs calm_recovery; verdict = "Elevated + turbulent" or "High stress" |
| Click "Slow Deterioration" | Verdict sentence mentions "slow deterioration" phrasing specifically |
| Raise VIX to 35, all else at current market | Tripod animated transition; elevated bar grows; alert status shows whether threshold is crossed |
| Set threshold to 10%, any non-calm scenario | Alert status block turns red |
| Set threshold to 70%, any scenario | Alert status block stays green for all but Panic Shock |
| Check sensitivity dots | VIX Level and VIX 5d Change should show red (high) dots — these dominate model importances |
| Driver section | Panic Shock: #1 VIX with "16.9 → 45.0" below name; Slow Deterioration: drawdown as #1 or #2 |
| Offsetting factor | Choppy-like scenario where 20d return is positive but VIX is high: return shows as "↓ partially offsetting" |
