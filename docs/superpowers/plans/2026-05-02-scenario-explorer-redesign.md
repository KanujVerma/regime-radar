# Scenario Explorer Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the saturating RiskRail with a Probability Tripod, add a verdict block with plain-English classification, connect the alert threshold to the active scenario, add sensitivity dots to sliders, and expand presets from 3 to 5 meaningfully-distinct scenarios.

**Architecture:** Pure frontend change. No backend modifications. All new logic derives from data already returned by `/scenario` (which includes `prob_calm/elevated/turbulent`, `baseline_prob_*`, `driver_deltas`, and `baseline_inputs`) and `/model-drivers` (which includes `global_importance`). One new component (`ProbabilityTripod`), two new exported functions in `narratives.ts`, and a major rework of `ScenarioExplorer.tsx`.

**Tech Stack:** React 18, TypeScript, Framer Motion, Vitest (tests), Tailwind CSS (inline style pattern used throughout the app — follow it)

---

## File map

| File | Action |
|------|--------|
| `frontend/src/lib/sliderConfig.ts` | Modify — replace 3 presets with 5 |
| `frontend/src/lib/narratives.ts` | Modify — add `buildScenarioVerdict`, `detectScenarioCharacter` |
| `frontend/src/lib/__tests__/narratives.test.ts` | Modify — add tests for new functions |
| `frontend/src/components/charts/ProbabilityTripod.tsx` | Create — new component |
| `frontend/src/pages/ScenarioExplorer.tsx` | Modify — major rework |

`RiskRail.tsx` is **not deleted or modified** — it just stops being used in ScenarioExplorer.

---

## Context for all tasks

This codebase uses **inline styles** (not Tailwind utility classes) for colors and most layout. Look at existing components like `Panel.tsx`, `RiskRail.tsx`, and `ScenarioExplorer.tsx` before adding anything — follow the same pattern. Colors are always hex strings defined directly in style props.

The app runs at `http://localhost:5173`. Start it with:
```bash
cd /Users/kanuj/regime-radar/frontend && npm run dev
```
The backend runs on `http://localhost:8000`. Start it (if needed for live data) with:
```bash
cd /Users/kanuj/regime-radar && uvicorn src.api.main:app --reload --port 8000
```

---

## Task 1: Update presets in `sliderConfig.ts`

**Files:**
- Modify: `frontend/src/lib/sliderConfig.ts`

No tests needed — this is a data change. Verify it compiles and the UI renders the new preset names.

- [ ] **Step 1: Read the current file**

```bash
cat frontend/src/lib/sliderConfig.ts
```

Confirm it currently exports `PRESETS` with keys `calm`, `choppy`, `stress`.

- [ ] **Step 2: Replace the PRESETS object and preset labels**

Open `frontend/src/lib/sliderConfig.ts`. Replace everything from `export const PRESETS` to the closing `}` with:

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

Keep `SLIDER_CONFIG`, `SliderConfig`, and `ScenarioInputs` exactly as they are — only `PRESETS` changes.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors. If ScenarioExplorer.tsx references old preset keys like `PRESETS['calm']`, those will error — that's fine, they'll be fixed in Task 4.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/sliderConfig.ts
git commit -m "feat: replace 3 presets with 5 meaningfully-distinct scenarios"
```

---

## Task 2: Add verdict logic to `narratives.ts` with tests

**Files:**
- Modify: `frontend/src/lib/narratives.ts`
- Modify: `frontend/src/lib/__tests__/narratives.test.ts`

Follow TDD: write failing tests first, then implement.

- [ ] **Step 1: Read the existing test file and narratives file**

```bash
cat frontend/src/lib/__tests__/narratives.test.ts
cat frontend/src/lib/narratives.ts
```

Confirm the test file imports from `'../narratives'` using Vitest. Confirm `narratives.ts` does not yet export `buildScenarioVerdict` or `detectScenarioCharacter`.

- [ ] **Step 2: Add failing tests to the test file**

Append the following to the **end** of `frontend/src/lib/__tests__/narratives.test.ts` (after the existing `buildDriversNarrative` describe block). Do not modify any existing tests.

```ts
import { detectScenarioCharacter, buildScenarioVerdict } from '../narratives'

describe('detectScenarioCharacter', () => {
  it('returns sharp-shock when vix_chg_5d >= 5 AND ret_20d <= -0.07', () => {
    expect(detectScenarioCharacter({
      vix_level: 45, vix_chg_5d: 5, rv_20d_pct: 0.9,
      drawdown_pct_504d: 0.3, ret_20d: -0.07, dist_sma50: -0.05,
    })).toBe('sharp-shock')
  })

  it('requires BOTH conditions for sharp-shock — high vix_chg + positive return is neutral', () => {
    expect(detectScenarioCharacter({
      vix_level: 45, vix_chg_5d: 6, rv_20d_pct: 0.9,
      drawdown_pct_504d: 0.3, ret_20d: 0.01, dist_sma50: -0.05,
    })).toBe('neutral')
  })

  it('returns slow-grind when vix_chg_5d <= 2 AND drawdown_pct_504d >= 0.25', () => {
    expect(detectScenarioCharacter({
      vix_level: 28, vix_chg_5d: 1, rv_20d_pct: 0.78,
      drawdown_pct_504d: 0.25, ret_20d: -0.08, dist_sma50: -0.06,
    })).toBe('slow-grind')
  })

  it('requires BOTH conditions for slow-grind — low chg but shallow drawdown is neutral', () => {
    expect(detectScenarioCharacter({
      vix_level: 28, vix_chg_5d: 1, rv_20d_pct: 0.78,
      drawdown_pct_504d: 0.10, ret_20d: -0.08, dist_sma50: -0.06,
    })).toBe('neutral')
  })

  it('returns neutral for normal conditions', () => {
    expect(detectScenarioCharacter({
      vix_level: 18, vix_chg_5d: 0, rv_20d_pct: 0.40,
      drawdown_pct_504d: 0.05, ret_20d: 0.01, dist_sma50: 0.01,
    })).toBe('neutral')
  })
})

describe('buildScenarioVerdict', () => {
  it('returns Unavailable when probCalm is NaN', () => {
    const result = buildScenarioVerdict(NaN, 0.5, 0.1, 'VIX Level')
    expect(result.badgeLabel).toBe('Unavailable')
    expect(result.sentence).toContain('not available')
  })

  it('returns Calm badge when probCalm >= 0.70', () => {
    const result = buildScenarioVerdict(0.80, 0.18, 0.02, 'VIX Level')
    expect(result.badgeLabel).toBe('Calm')
    expect(result.sentence).toContain('calm')
    expect(result.badgeColor).toBe('#4ade80')
  })

  it('returns Mild stress badge when probCalm is between 0.40 and 0.70', () => {
    const result = buildScenarioVerdict(0.55, 0.43, 0.02, 'VIX Level')
    expect(result.badgeLabel).toBe('Mild stress')
    expect(result.sentence).toContain('VIX Level')
    expect(result.badgeColor).toBe('#06b6d4')
  })

  it('returns Elevated stress for elevated tier with neutral character', () => {
    const result = buildScenarioVerdict(0.30, 0.68, 0.015, 'Realized vol', 'neutral')
    expect(result.badgeLabel).toBe('Elevated stress')
    expect(result.sentence).toContain('Elevated')
    expect(result.badgeColor).toBe('#fbbf24')
  })

  it('uses sharp-shock sentence when character is sharp-shock', () => {
    const result = buildScenarioVerdict(0.30, 0.68, 0.015, 'VIX Level', 'sharp-shock')
    expect(result.badgeLabel).toBe('Elevated stress')
    expect(result.sentence).toContain('sharp')
  })

  it('uses slow-grind sentence and mentions topDriverLabel when character is slow-grind', () => {
    const result = buildScenarioVerdict(0.30, 0.68, 0.015, 'Drawdown', 'slow-grind')
    expect(result.badgeLabel).toBe('Elevated stress')
    expect(result.sentence).toContain('slow deterioration')
    expect(result.sentence).toContain('Drawdown')
  })

  it('returns High stress for strongly-elevated tier (probCalm < 0.15, probTurbulent < 0.02)', () => {
    const result = buildScenarioVerdict(0.05, 0.94, 0.01, 'VIX Level')
    expect(result.badgeLabel).toBe('High stress')
    expect(result.sentence).toContain('VIX Level')
    expect(result.badgeColor).toBe('#f97316')
  })

  it('returns Elevated + turbulent when probTurbulent >= 0.02', () => {
    const result = buildScenarioVerdict(0.10, 0.87, 0.03, 'VIX Level')
    expect(result.badgeLabel).toBe('Elevated + turbulent')
    expect(result.sentence).toContain('Turbulent risk')
    expect(result.badgeColor).toBe('#f87171')
  })

  it('all badge styles are populated (no undefined colors)', () => {
    const cases: [number, number, number][] = [
      [0.80, 0.18, 0.02],
      [0.55, 0.43, 0.02],
      [0.30, 0.68, 0.015],
      [0.05, 0.94, 0.01],
      [0.10, 0.87, 0.03],
    ]
    cases.forEach(([pc, pe, pt]) => {
      const r = buildScenarioVerdict(pc, pe, pt, 'VIX')
      expect(r.badgeColor).toMatch(/^#[0-9a-f]{6}$/i)
      expect(r.badgeBg).toMatch(/^#[0-9a-f]{6}$/i)
      expect(r.badgeBorder).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })

  it('character defaults to neutral when omitted', () => {
    const withChar = buildScenarioVerdict(0.30, 0.68, 0.01, 'VIX', 'neutral')
    const withoutChar = buildScenarioVerdict(0.30, 0.68, 0.01, 'VIX')
    expect(withoutChar.sentence).toBe(withChar.sentence)
  })
})
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
cd frontend && npx vitest run src/lib/__tests__/narratives.test.ts 2>&1 | tail -20
```

Expected: multiple FAIL lines about `detectScenarioCharacter` and `buildScenarioVerdict` not being exported.

- [ ] **Step 4: Implement the new functions in `narratives.ts`**

Add the following to the **end** of `frontend/src/lib/narratives.ts`. Do not touch any existing code in the file.

```ts
import type { ScenarioInputs } from './sliderConfig'

export type ScenarioCharacter = 'sharp-shock' | 'slow-grind' | 'neutral'

export interface ScenarioVerdictResult {
  badgeLabel: string
  badgeColor: string
  badgeBg: string
  badgeBorder: string
  sentence: string
}

type SeverityTier = 'calm' | 'stress-building' | 'elevated' | 'strongly-elevated' | 'turbulent-emerging'

function getSeverityTier(probCalm: number, probTurbulent: number): SeverityTier {
  if (probCalm >= 0.70)                          return 'calm'
  if (probCalm >= 0.40)                          return 'stress-building'
  if (probCalm >= 0.15 && probTurbulent < 0.02)  return 'elevated'
  if (probCalm < 0.15  && probTurbulent < 0.02)  return 'strongly-elevated'
  return 'turbulent-emerging'
}

const BADGE_STYLES: Record<SeverityTier, Pick<ScenarioVerdictResult, 'badgeLabel' | 'badgeColor' | 'badgeBg' | 'badgeBorder'>> = {
  'calm':                { badgeLabel: 'Calm',                  badgeColor: '#4ade80', badgeBg: '#0f2a1a', badgeBorder: '#14532d' },
  'stress-building':     { badgeLabel: 'Mild stress',           badgeColor: '#06b6d4', badgeBg: '#051820', badgeBorder: '#0e3d55' },
  'elevated':            { badgeLabel: 'Elevated stress',       badgeColor: '#fbbf24', badgeBg: '#1a1505', badgeBorder: '#78350f' },
  'strongly-elevated':   { badgeLabel: 'High stress',           badgeColor: '#f97316', badgeBg: '#1a0c03', badgeBorder: '#7c2d12' },
  'turbulent-emerging':  { badgeLabel: 'Elevated + turbulent',  badgeColor: '#f87171', badgeBg: '#1a0505', badgeBorder: '#7f1d1d' },
}

function getSentence(tier: SeverityTier, topDriverLabel: string, character: ScenarioCharacter): string {
  switch (tier) {
    case 'calm':
      return 'Conditions remain calm under this scenario. The model sees no meaningful stress signal.'
    case 'stress-building':
      return `Calm is still the most likely outcome, but stress conditions are starting to build. ${topDriverLabel} is the main factor weighing on the model.`
    case 'elevated':
      if (character === 'sharp-shock')
        return 'This looks like a sharp stress event — elevated conditions are dominant. Calm has receded but turbulent probability remains contained.'
      if (character === 'slow-grind')
        return `This scenario is mostly Elevated rather than Turbulent — more of a slow deterioration than a sudden shock. ${topDriverLabel} is the primary driver.`
      return 'This scenario is mostly Elevated rather than Turbulent. Calm has receded and elevated conditions are dominant.'
    case 'strongly-elevated':
      return `Calm has largely left the picture under this scenario. Elevated conditions are heavily dominant — ${topDriverLabel} is driving the stress reading.`
    case 'turbulent-emerging':
      return `Turbulent risk is beginning to emerge alongside elevated stress. ${topDriverLabel} is pushing conditions toward a more severe stress classification.`
  }
}

export function detectScenarioCharacter(inputs: ScenarioInputs): ScenarioCharacter {
  if (inputs.vix_chg_5d >= 5 && inputs.ret_20d <= -0.07) return 'sharp-shock'
  if (inputs.vix_chg_5d <= 2 && inputs.drawdown_pct_504d >= 0.25) return 'slow-grind'
  return 'neutral'
}

export function buildScenarioVerdict(
  probCalm: number,
  probElevated: number,
  probTurbulent: number,
  topDriverLabel: string,
  character: ScenarioCharacter = 'neutral',
): ScenarioVerdictResult {
  if (!isFinite(probCalm) || !isFinite(probElevated) || !isFinite(probTurbulent)) {
    return {
      badgeLabel: 'Unavailable',
      badgeColor: '#475569',
      badgeBg: '#0c1020',
      badgeBorder: '#1e293b',
      sentence: 'Scenario data is not available yet.',
    }
  }
  const tier = getSeverityTier(probCalm, probTurbulent)
  return {
    ...BADGE_STYLES[tier],
    sentence: getSentence(tier, topDriverLabel, character),
  }
}
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd frontend && npx vitest run src/lib/__tests__/narratives.test.ts 2>&1 | tail -20
```

Expected: all tests pass, no failures.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/narratives.ts frontend/src/lib/__tests__/narratives.test.ts
git commit -m "feat: add buildScenarioVerdict and detectScenarioCharacter to narratives"
```

---

## Task 3: Create `ProbabilityTripod` component

**Files:**
- Create: `frontend/src/components/charts/ProbabilityTripod.tsx`

No unit tests for visual components — verify in the browser after Task 4 wires it up.

- [ ] **Step 1: Look at an existing chart component for style reference**

```bash
cat frontend/src/components/charts/RiskRail.tsx
```

Note: it uses `motion` from framer-motion, inline styles, and receives plain number props. Follow the same pattern.

- [ ] **Step 2: Create the component**

Create `frontend/src/components/charts/ProbabilityTripod.tsx` with the following content:

```tsx
import { motion } from 'framer-motion'

interface ProbabilityTripodProps {
  baselineCalm: number
  baselineElevated: number
  baselineTurbulent: number
  scenarioCalm: number
  scenarioElevated: number
  scenarioTurbulent: number
}

const TILES = [
  {
    key: 'calm' as const,
    label: 'Calm',
    color: '#4ade80',
    bg: '#071410',
    defaultBorder: '#0e2e20',
  },
  {
    key: 'elevated' as const,
    label: 'Elevated',
    color: '#fbbf24',
    bg: '#130f02',
    defaultBorder: '#78350f',
  },
  {
    key: 'turbulent' as const,
    label: 'Turbulent',
    color: '#f87171',
    bg: '#0e0505',
    defaultBorder: '#2d0e0e',
  },
]

export default function ProbabilityTripod({
  baselineCalm, baselineElevated, baselineTurbulent,
  scenarioCalm, scenarioElevated, scenarioTurbulent,
}: ProbabilityTripodProps) {
  const scenarioValues = { calm: scenarioCalm, elevated: scenarioElevated, turbulent: scenarioTurbulent }
  const baselineValues = { calm: baselineCalm, elevated: baselineElevated, turbulent: baselineTurbulent }

  const dominant = scenarioCalm >= scenarioElevated && scenarioCalm >= scenarioTurbulent
    ? 'calm'
    : scenarioElevated >= scenarioTurbulent
    ? 'elevated'
    : 'turbulent'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      {TILES.map(tile => {
        const scenVal = scenarioValues[tile.key]
        const baseVal = baselineValues[tile.key]
        const isDominant = dominant === tile.key
        const deltaPp = (scenVal - baseVal) * 100
        const deltaLabel = Math.abs(deltaPp) < 0.5
          ? 'no change'
          : `${deltaPp > 0 ? '+' : ''}${deltaPp.toFixed(0)}pp`
        const scenarioPct = (scenVal * 100).toFixed(1) + '%'

        return (
          <div
            key={tile.key}
            style={{
              background: tile.bg,
              border: isDominant ? `1.5px solid ${tile.color}` : `1px solid ${tile.defaultBorder}`,
              borderRadius: 8,
              padding: '12px 10px',
              position: 'relative',
            }}
          >
            {/* Dominant pill */}
            {isDominant && (
              <div
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 8,
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: tile.color,
                  background: tile.bg,
                  padding: '1px 5px',
                  borderRadius: 8,
                  border: `1px solid ${tile.defaultBorder}`,
                }}
              >
                dominant
              </div>
            )}

            {/* Tile label */}
            <div
              style={{
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: tile.color,
                opacity: 0.7,
                marginBottom: 6,
              }}
            >
              {tile.label}
            </div>

            {/* Baseline → scenario */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: tile.color, opacity: 0.4 }}>
                {(baseVal * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: 9, color: '#1e293b' }}>→</span>
              <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color: tile.color }}>
                {(scenVal * 100).toFixed(0)}%
              </span>
            </div>

            {/* Delta label */}
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                marginTop: 4,
                color: deltaLabel === 'no change' ? '#64748b' : deltaPp > 0 ? tile.color : '#4ade80',
              }}
            >
              {deltaLabel}
            </div>

            {/* Animated progress bar */}
            <div
              style={{
                height: 4,
                background: '#080b12',
                borderRadius: 2,
                marginTop: 8,
                overflow: 'hidden',
              }}
            >
              <motion.div
                animate={{ width: scenarioPct }}
                initial={{ width: '0%' }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                style={{ height: '100%', borderRadius: 2, background: tile.color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/charts/ProbabilityTripod.tsx
git commit -m "feat: add ProbabilityTripod component"
```

---

## Task 4: Rework `ScenarioExplorer.tsx`

**Files:**
- Modify: `frontend/src/pages/ScenarioExplorer.tsx`

This is the final wiring task. It replaces the old RiskRail usage, removes the per-regime bars panel and narrative panel, adds the verdict block, tripod, sensitivity dots, threshold alert connection, and updated driver section.

- [ ] **Step 1: Read the current file in full**

```bash
cat frontend/src/pages/ScenarioExplorer.tsx
```

Confirm current imports include `RiskRail`, the old 3-preset buttons (`calm`, `choppy`, `stress`), and `buildNarrative`. All of these will be removed or replaced.

- [ ] **Step 2: Replace the entire file**

Write the following complete replacement to `frontend/src/pages/ScenarioExplorer.tsx`:

```tsx
import { useState, useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import ProbabilityTripod from '../components/charts/ProbabilityTripod'
import { useScenario } from '../hooks/useScenario'
import { SLIDER_CONFIG, PRESETS, type ScenarioInputs } from '../lib/sliderConfig'
import { DEFAULT_THRESHOLD } from '../lib/constants'
import { useModelDrivers } from '../hooks/useModelDrivers'
import { buildScenarioVerdict, detectScenarioCharacter } from '../lib/narratives'

const DEFAULT_INPUTS: ScenarioInputs = {
  vix_level: 18, vix_chg_5d: 0, rv_20d_pct: 0.40,
  drawdown_pct_504d: 0.05, ret_20d: 0.01, dist_sma50: 0.01,
}

const PRESET_BUTTONS = [
  { id: 'calm_recovery',      icon: '🌤', label: 'Calm Recovery',      desc: 'Low vol, long calm streak' },
  { id: 'volatility_pickup',  icon: '📈', label: 'Volatility Pickup',  desc: 'VIX rising, still near highs' },
  { id: 'growth_scare',       icon: '📉', label: 'Growth Scare',       desc: 'Moderate selloff, vol elevated' },
  { id: 'panic_shock',        icon: '⚡', label: 'Panic Shock',        desc: 'Sharp VIX spike, deep drawdown' },
  { id: 'slow_deterioration', icon: '🐌', label: 'Slow Deterioration', desc: 'Grinding lower, no single spike' },
]

const SLIDER_KEYS_FOR_SENSITIVITY = [
  'vix_level', 'vix_chg_5d', 'rv_20d_pct', 'drawdown_pct_504d', 'ret_20d', 'dist_sma50',
] as const

const SENSITIVITY_COLORS = { high: '#f87171', medium: '#fbbf24', low: '#475569' } as const

const PERCENTILE_KEYS = new Set(['rv_20d_pct', 'drawdown_pct_504d'])

function getSliderSensitivity(
  key: string,
  globalImportance: { feature: string; importance: number }[] | undefined,
): 'high' | 'medium' | 'low' {
  if (!globalImportance) return 'low'
  const ranked = [...globalImportance]
    .filter(d => (SLIDER_KEYS_FOR_SENSITIVITY as readonly string[]).includes(d.feature))
    .sort((a, b) => b.importance - a.importance)
  const idx = ranked.findIndex(d => d.feature === key)
  if (idx === -1) return 'low'
  if (idx <= 1)   return 'high'
  if (idx <= 3)   return 'medium'
  return 'low'
}

function sliderColor(cfg: (typeof SLIDER_CONFIG)[0], val: number): string {
  if (val <= cfg.calmMax) return '#06b6d4'
  if (val >= cfg.stressMin) return '#f87171'
  return '#fbbf24'
}

function formatDriverVal(feature: string, val: number): string {
  return PERCENTILE_KEYS.has(feature)
    ? `${(val * 100).toFixed(0)}%`
    : val.toFixed(1)
}

export default function ScenarioExplorer() {
  const [inputs, setInputs] = useState<ScenarioInputs>(DEFAULT_INPUTS)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const { data, loading, error } = useScenario(inputs)
  const { data: modelData } = useModelDrivers()

  const [currentMarketInputs, setCurrentMarketInputs] = useState<ScenarioInputs | null>(null)
  const seededRef = useRef(false)
  useEffect(() => {
    if (data?.baseline_inputs && !seededRef.current) {
      seededRef.current = true
      const marketInputs = { ...DEFAULT_INPUTS, ...data.baseline_inputs } as ScenarioInputs
      setCurrentMarketInputs(marketInputs)
      setInputs(marketInputs)
    }
  }, [data])

  const reset = useCallback(
    () => setInputs(currentMarketInputs ?? DEFAULT_INPUTS),
    [currentMarketInputs],
  )

  const sweepRow = modelData?.threshold_sweep?.find(r => Math.abs(r.threshold - threshold) < 0.05)

  const scenarioStress = data ? 1 - data.prob_calm : null
  const baselineStress = data ? 1 - data.baseline_prob_calm : null
  const thresholdGap = scenarioStress != null ? scenarioStress - threshold : null

  const character = detectScenarioCharacter(inputs)
  const verdict = data
    ? buildScenarioVerdict(
        data.prob_calm,
        data.prob_elevated,
        data.prob_turbulent,
        data.driver_deltas[0]?.plain_label ?? '',
        character,
      )
    : null

  const dominant = data
    ? (data.prob_calm >= data.prob_elevated && data.prob_calm >= data.prob_turbulent
        ? 'Calm'
        : data.prob_elevated >= data.prob_turbulent
        ? 'Elevated'
        : 'Turbulent')
    : null

  const positiveDrivers = data?.driver_deltas.filter(d => d.delta_value > 0) ?? []
  const offsetDriver = (
    data?.driver_deltas?.length &&
    data.driver_deltas[0].delta_value > 0
  ) ? (data.driver_deltas.find(d => d.delta_value < 0) ?? null) : null

  const resetBtn = (
    <button
      onClick={reset}
      className="text-[10px] font-bold px-3 py-1.5 rounded"
      style={{ background: '#0c1020', border: '1px solid #151d2e', color: '#64748b' }}
    >
      ↺ Reset to current market
    </button>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar title="Scenario Explorer" action={resetBtn} />
      <div className="p-5 flex gap-5">

        {/* ── Left column ── */}
        <div className="shrink-0 space-y-4" style={{ width: 276 }}>

          {/* Presets */}
          <Panel title="Quick scenarios">
            <div className="flex flex-col gap-2">
              {PRESET_BUTTONS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setInputs(PRESETS[p.id])}
                  className="text-left px-3 py-2 rounded-lg w-full"
                  style={{ background: '#080b12', border: '1px solid #151d2e' }}
                >
                  <div className="text-[11px] font-semibold" style={{ color: '#94a3b8' }}>
                    {p.icon} {p.label}
                  </div>
                  <div className="text-[9px] mt-0.5" style={{ color: '#475569' }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </Panel>

          <div className="h-px" style={{ background: '#151d2e' }} />

          {/* Sensitivity legend */}
          <div className="flex items-center gap-3">
            <span className="text-[8px] font-bold tracking-widest uppercase" style={{ color: '#4a6080' }}>
              Model weight
            </span>
            {(['high', 'medium', 'low'] as const).map(s => (
              <span key={s} className="flex items-center gap-1 text-[8px]" style={{ color: '#475569' }}>
                <span
                  style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: SENSITIVITY_COLORS[s], display: 'inline-block',
                  }}
                />
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            ))}
          </div>

          {/* Sliders */}
          <div className="space-y-4">
            {SLIDER_CONFIG.map(cfg => {
              const val = inputs[cfg.key]
              const color = sliderColor(cfg, val)
              const sensitivity = getSliderSensitivity(cfg.key, modelData?.global_importance)
              return (
                <div key={cfg.key}>
                  <div className="flex justify-between mb-1 items-center">
                    <span
                      className="text-[10px] font-semibold flex items-center gap-1.5"
                      style={{ color: '#94a3b8' }}
                    >
                      <span
                        style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: SENSITIVITY_COLORS[sensitivity],
                          display: 'inline-block', flexShrink: 0,
                        }}
                      />
                      {cfg.label}
                    </span>
                    <span className="text-[10px] font-bold" style={{ color }}>
                      {val.toFixed(cfg.step < 0.1 ? 2 : 1)}
                    </span>
                  </div>
                  <p className="text-[9px] mb-1.5" style={{ color: '#94a3b8' }}>{cfg.helper}</p>
                  <input
                    type="range"
                    min={cfg.min}
                    max={cfg.max}
                    step={cfg.step}
                    value={val}
                    onChange={e => setInputs(prev => ({ ...prev, [cfg.key]: parseFloat(e.target.value) }))}
                    className="w-full cursor-pointer"
                    style={{ accentColor: color }}
                  />
                </div>
              )
            })}
          </div>

          <div className="h-px" style={{ background: '#151d2e' }} />

          {/* Threshold section */}
          <div>
            <div
              className="text-[9px] font-bold tracking-widest uppercase mb-2"
              style={{ color: '#4a6080' }}
            >
              Alert threshold
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-[10px]" style={{ color: '#94a3b8' }}>Threshold</span>
              <span className="text-[10px] font-bold" style={{ color: '#fbbf24' }}>
                {(threshold * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range" min={0.10} max={0.70} step={0.10}
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-full cursor-pointer mb-3"
              style={{ accentColor: '#fbbf24' }}
            />

            {/* Alert connection block */}
            {data && thresholdGap != null && (
              <div
                className="rounded-lg px-3 py-2 mb-3"
                style={thresholdGap < 0
                  ? { background: '#0f2a1a', border: '1px solid #14532d' }
                  : { background: '#1a0505', border: '1px solid #7f1d1d' }}
              >
                <div
                  className="text-[10px] font-semibold"
                  style={{ color: thresholdGap < 0 ? '#4ade80' : '#f87171' }}
                >
                  {thresholdGap < 0
                    ? '✓ This scenario stays below your alert threshold'
                    : '⚠ This scenario would cross your alert threshold'}
                </div>
                <div className="text-[9px] mt-1" style={{ color: '#475569' }}>
                  {thresholdGap < 0
                    ? `Stress probability ${(scenarioStress! * 100).toFixed(0)}% — ${Math.abs(thresholdGap * 100).toFixed(0)}pp below the ${(threshold * 100).toFixed(0)}% threshold`
                    : `Stress probability ${(scenarioStress! * 100).toFixed(0)}% exceeds the ${(threshold * 100).toFixed(0)}% threshold by ${(thresholdGap * 100).toFixed(0)}pp`}
                </div>
              </div>
            )}

            {sweepRow ? (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Crises caught', value: `${(sweepRow.recall * 100).toFixed(0)}%` },
                  { label: 'False alarms',  value: `${(sweepRow.false_alert_rate * 100).toFixed(0)}%` },
                  { label: 'Avg warning',   value: `${sweepRow.avg_lead_time_days.toFixed(0)}d` },
                ].map(m => (
                  <div
                    key={m.label}
                    className="rounded-lg p-2 text-center"
                    style={{ background: '#080b12', border: '1px solid #151d2e' }}
                  >
                    <div className="text-[8px] tracking-wide uppercase" style={{ color: '#4a6080' }}>{m.label}</div>
                    <div className="text-[14px] font-extrabold" style={{ color: '#94a3b8' }}>{m.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[9px]" style={{ color: '#94a3b8' }}>Threshold data unavailable</p>
            )}
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="flex-1 space-y-4">
          {loading && <div className="text-slate-500 text-sm">Calculating…</div>}
          {error && <div className="text-red-400 text-sm">{error}</div>}

          {data && verdict && (
            <>
              {/* Verdict block */}
              <div
                className="rounded-xl p-4"
                style={{ border: '1px solid #1a3a5f', background: '#080d18' }}
              >
                {/* Badge + dominant label */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                    style={{
                      background: verdict.badgeBg,
                      border: `1px solid ${verdict.badgeBorder}`,
                      color: verdict.badgeColor,
                    }}
                  >
                    {verdict.badgeLabel}
                  </span>
                  {dominant && (
                    <span className="text-[9px] font-semibold" style={{ color: '#4a6080' }}>
                      · {dominant} dominant
                    </span>
                  )}
                </div>

                {/* Verdict sentence */}
                <p
                  className="text-[11px] leading-relaxed mb-2"
                  style={{ color: '#94a3b8' }}
                >
                  {verdict.sentence}
                </p>

                {/* Secondary stats */}
                <div className="flex items-center gap-4 mb-2">
                  <span className="text-[9px]" style={{ color: '#64748b' }}>
                    Non-calm:{' '}
                    <span className="font-semibold">
                      {((1 - data.prob_calm) * 100).toFixed(0)}%
                    </span>
                  </span>
                  {baselineStress != null && (
                    <span className="text-[9px]" style={{ color: '#64748b' }}>
                      Δ{' '}
                      {(1 - data.prob_calm - baselineStress) >= 0 ? '+' : ''}
                      {((1 - data.prob_calm - baselineStress) * 100).toFixed(0)}pp vs current
                    </span>
                  )}
                </div>

                {/* Alert pill */}
                {thresholdGap != null && (
                  <span
                    className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                    style={thresholdGap < 0
                      ? { background: '#0f2a1a', color: '#4ade80' }
                      : { background: '#1a0505', color: '#f87171' }}
                  >
                    {thresholdGap < 0 ? '✓ Below alert threshold' : '⚠ Alert threshold crossed'}
                  </span>
                )}
              </div>

              {/* Probability Tripod */}
              <Panel title="Regime probability — current market → your scenario">
                <ProbabilityTripod
                  baselineCalm={data.baseline_prob_calm}
                  baselineElevated={data.baseline_prob_elevated}
                  baselineTurbulent={data.baseline_prob_turbulent}
                  scenarioCalm={data.prob_calm}
                  scenarioElevated={data.prob_elevated}
                  scenarioTurbulent={data.prob_turbulent}
                />
              </Panel>

              {/* Driver explanation */}
              <Panel title="What's driving this scenario">
                <p className="text-[10px] mb-3" style={{ color: '#94a3b8' }}>
                  Biggest input shifts driving the scenario difference
                </p>

                {positiveDrivers.map((d, i) => {
                  const baselineVal = data.baseline_inputs?.[d.feature] ?? null
                  const scenarioVal = baselineVal != null ? baselineVal + d.delta_value : null
                  return (
                    <div key={d.feature} className="flex items-start gap-2.5 mb-3">
                      <span
                        className="text-[10px] font-bold shrink-0 mt-0.5"
                        style={{ color: '#f87171', width: 20 }}
                      >
                        #{i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>
                          {d.plain_label}
                        </div>
                        {baselineVal != null && scenarioVal != null && (
                          <div className="text-[9px] mt-0.5" style={{ color: '#475569' }}>
                            {formatDriverVal(d.feature, baselineVal)} → {formatDriverVal(d.feature, scenarioVal)}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold shrink-0" style={{ color: '#f87171' }}>
                        +{d.delta_value.toFixed(2)}
                      </span>
                    </div>
                  )
                })}

                {offsetDriver && (
                  <div className="mt-1 pt-3" style={{ borderTop: '1px solid #151d2e' }}>
                    <div className="flex items-start gap-2.5">
                      <span
                        className="text-[10px] font-bold shrink-0 mt-0.5"
                        style={{ color: '#4ade80' }}
                      >
                        ↓
                      </span>
                      <div className="flex-1">
                        <div className="text-[10px] font-semibold" style={{ color: '#4ade80' }}>
                          {offsetDriver.plain_label}{' '}
                          <span className="font-normal text-[9px]" style={{ color: '#475569' }}>
                            (partially offsetting)
                          </span>
                        </div>
                        <div className="text-[9px] mt-0.5" style={{ color: '#475569' }}>
                          {offsetDriver.plain_label} is limiting how stressed this scenario becomes.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>

      </div>
    </motion.div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. Common issue to watch: if the old import `buildNarrative` is referenced anywhere — the above code removes it, so it should be clean.

- [ ] **Step 4: Run full test suite**

```bash
cd frontend && npx vitest run 2>&1 | tail -20
```

Expected: all existing tests pass (no regressions). The new tests from Task 2 also pass.

- [ ] **Step 5: Start the dev server and verify in browser**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173 and navigate to Scenario Explorer. Verify:

1. **Presets**: 5 buttons visible with subtitles — Calm Recovery / Volatility Pickup / Growth Scare / Panic Shock / Slow Deterioration
2. **Sensitivity dots**: each slider has a colored dot to its left
3. **Verdict block**: visible at top of right column with badge + sentence
4. **Tripod**: three animated tiles below verdict block
5. **Driver panel**: title is "What's driving this scenario", ranked #1/#2/#3
6. **Threshold alert connection**: colored block appears between threshold slider and sweep stats
7. Click "Calm Recovery" → tripod calm tile is dominant, badge = "Calm"
8. Click "Panic Shock" → elevated tile dominant, badge = "High stress" or "Elevated + turbulent"
9. Click "Slow Deterioration" → verdict sentence contains "deterioration" or "grinding"
10. Adjust threshold to 10% → alert block turns red for any stress preset
11. Non-calm % in verdict block is small (9px), not a large headline number

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ScenarioExplorer.tsx
git commit -m "feat: rework Scenario Explorer with tripod, verdict, and improved presets"
```

---

## Self-review checklist

After all 4 tasks are committed, run:

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

Expected: all tests pass, no TypeScript errors.

Then do a final visual pass in the browser to confirm the spec's testing table is satisfied.
