# Model Drivers Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Model Drivers page from two stacked panels to a newspaper-front-page layout with a hero case brief, plain-English push/pull bullets, global importance bars, a forward-looking block, and a collapsed reliability accordion.

**Architecture:** Four pure-function helpers drive all text generation: `sentenceFor` (bullet-list sentences), `narrativeFragmentFor` (mid-sentence noun phrases for the hero), `buildDriversNarrative` (2–3 sentence hero body combining up to 2 pushing + 2 holding factors), and `getDriverHeadline` (regime headline). `ModelDrivers.tsx` is a full rewrite calling both `useCurrentState` and `useModelDrivers`. No new files — logic lives in existing `lib/` files and the page itself.

**Tech Stack:** React 18, TypeScript, Tailwind, framer-motion, Vitest (added in Task 1).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/lib/featureLabels.ts` | Modify | Add `NARRATIVE_FRAGMENTS`, `narrativeFragmentFor()`, `SENTENCE_TEMPLATES`, `sentenceFor()` |
| `frontend/src/lib/narratives.ts` | Modify | Add `DRIVER_HEADLINES`, `getDriverHeadline()`, `buildDriversNarrative()` |
| `frontend/src/pages/ModelDrivers.tsx` | Full rewrite | Layout C: hero, two-column, forward block, reliability accordion |
| `frontend/src/lib/__tests__/featureLabels.test.ts` | Create | Unit tests for `sentenceFor` and `narrativeFragmentFor` |
| `frontend/src/lib/__tests__/narratives.test.ts` | Create | Unit tests for `buildDriversNarrative` and `getDriverHeadline` |
| `frontend/package.json` | Modify | Add vitest dev dependency and `"test"` script |

---

## Task 1: Install Vitest

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install vitest**

Run from the `frontend/` directory:
```bash
cd frontend && npm install -D vitest
```

Expected: vitest appears in `devDependencies` in `package.json`.

- [ ] **Step 2: Add test script to package.json**

In `frontend/package.json`, add `"test": "vitest run"` to the `"scripts"` section:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:smoke": "playwright test",
  "test:smoke:headed": "playwright test --headed"
}
```

- [ ] **Step 3: Verify vitest runs**

```bash
cd frontend && npm test
```

Expected: `No test files found, exiting with code 0` or similar — no error.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add vitest for frontend unit tests"
```

---

## Task 2: Add `sentenceFor` and `narrativeFragmentFor` to `featureLabels.ts`

`sentenceFor` produces complete sentences for push/pull bullet lists.
`narrativeFragmentFor` produces short lowercase noun phrases for use mid-sentence in the hero narrative.

**Files:**
- Modify: `frontend/src/lib/featureLabels.ts`
- Create: `frontend/src/lib/__tests__/featureLabels.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/__tests__/featureLabels.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sentenceFor, narrativeFragmentFor } from '../featureLabels'

describe('sentenceFor', () => {
  it('returns up sentence for drawdown', () => {
    expect(sentenceFor('drawdown_pct_504d', 'up')).toBe('SPY has pulled back from its 2-year high')
  })
  it('returns down sentence for drawdown', () => {
    expect(sentenceFor('drawdown_pct_504d', 'down')).toBe('SPY is near its 2-year high')
  })
  it('returns up sentence for rv_20d', () => {
    expect(sentenceFor('rv_20d', 'up')).toBe('Recent realized volatility has been high')
  })
  it('returns down sentence for rv_20d', () => {
    expect(sentenceFor('rv_20d', 'down')).toBe('Recent realized volatility has been low')
  })
  it('returns up sentence for ret_20d', () => {
    expect(sentenceFor('ret_20d', 'up')).toBe("SPY's 20-day return has been weak")
  })
  it('returns down sentence for ret_20d', () => {
    expect(sentenceFor('ret_20d', 'down')).toBe('SPY is up over the past 20 trading days')
  })
  it('returns tightened up sentence for days_in_regime_lag1', () => {
    expect(sentenceFor('days_in_regime_lag1', 'up')).toBe('These conditions have lasted longer than usual')
  })
  it('returns tightened up sentence for trend_code', () => {
    expect(sentenceFor('trend_code', 'up')).toBe("SPY's recent trend has turned negative")
  })
  it('returns tightened down sentence for trend_code', () => {
    expect(sentenceFor('trend_code', 'down')).toBe("SPY's recent trend remains positive")
  })
  it('falls back to feature key for unknown features', () => {
    expect(sentenceFor('unknown_feature_xyz', 'up')).toBe('unknown_feature_xyz')
  })
})

describe('narrativeFragmentFor', () => {
  it('returns noun phrase for drawdown up', () => {
    expect(narrativeFragmentFor('drawdown_pct_504d', 'up')).toBe('a pullback from the 2-year high')
  })
  it('returns noun phrase for emv_level up', () => {
    expect(narrativeFragmentFor('emv_level', 'up')).toBe('a rising equity market volatility index')
  })
  it('returns noun phrase for ret_20d down', () => {
    expect(narrativeFragmentFor('ret_20d', 'down')).toBe('positive 20-day momentum')
  })
  it('returns noun phrase for rv_20d down', () => {
    expect(narrativeFragmentFor('rv_20d', 'down')).toBe('low realized volatility')
  })
  it('falls back to lowercase label for unknown features', () => {
    expect(narrativeFragmentFor('unknown_xyz', 'up')).toBe('unknown_xyz')
  })
})
```

- [ ] **Step 2: Run — confirm it fails**

```bash
cd frontend && npm test
```

Expected: `sentenceFor is not a function` or `narrativeFragmentFor is not a function`.

- [ ] **Step 3: Implement both functions in `featureLabels.ts`**

Replace the full contents of `frontend/src/lib/featureLabels.ts` with:

```ts
export const FEATURE_LABELS: Record<string, string> = {
  vix_pct_504d:             'VIX relative to 2-year history',
  vix_level:                'Current VIX level',
  vix_zscore_252d:          'VIX vs 1-year history',
  vix_chg_5d:               'VIX 5-day change',
  rv_20d:                   'Recent realized volatility',
  rv_20d_pct:               'Realized volatility vs history',
  drawdown_pct_504d:        'Drawdown relative to 2-year high',
  ret_20d:                  '20-day SPY return',
  momentum_20d:             '20-day price momentum',
  dist_sma50:               'Distance from 50-day moving average',
  emv_level:                'Equity market volatility index',
  days_in_regime_lag1:      'Days in current regime',
  turbulent_count_30d_lag1: 'Recent high-stress days',
  trend_code:               'Trend direction',
}

export function labelFor(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature
}

// Mid-sentence noun phrases — used inside hero narrative copy
const NARRATIVE_FRAGMENTS: Record<string, { up: string; down: string }> = {
  vix_pct_504d:             { up: 'an elevated volatility index relative to recent history', down: 'a subdued volatility index' },
  vix_level:                { up: 'an elevated VIX',                                        down: 'a low VIX' },
  vix_zscore_252d:          { up: 'VIX above its recent average',                           down: 'VIX below its recent average' },
  vix_chg_5d:               { up: 'a rising volatility index',                              down: 'a falling volatility index' },
  rv_20d:                   { up: 'elevated realized volatility',                           down: 'low realized volatility' },
  rv_20d_pct:               { up: 'above-average realized volatility',                      down: 'below-average realized volatility' },
  drawdown_pct_504d:        { up: 'a pullback from the 2-year high',                        down: 'proximity to the 2-year high' },
  ret_20d:                  { up: 'a weak 20-day return',                                   down: 'positive 20-day momentum' },
  momentum_20d:             { up: 'negative recent momentum',                               down: 'positive recent momentum' },
  dist_sma50:               { up: 'a drop below the 50-day average',                        down: 'support above the 50-day average' },
  emv_level:                { up: 'a rising equity market volatility index',                down: 'a low equity market volatility index' },
  days_in_regime_lag1:      { up: 'an extended run in the current conditions',              down: 'a recent regime change' },
  turbulent_count_30d_lag1: { up: 'a pickup in recent stress days',                        down: 'limited stress days recently' },
  trend_code:               { up: 'a negative price trend',                                 down: 'a positive price trend' },
}

export function narrativeFragmentFor(feature: string, direction: 'up' | 'down'): string {
  return NARRATIVE_FRAGMENTS[feature]?.[direction] ?? labelFor(feature).toLowerCase()
}

// Complete sentences for push/pull bullet lists
const SENTENCE_TEMPLATES: Record<string, { up: string; down: string }> = {
  vix_pct_504d:             { up: 'VIX is elevated relative to its recent history',          down: 'VIX is low relative to its recent history' },
  vix_level:                { up: 'The VIX level is elevated',                               down: 'The VIX level is low' },
  vix_zscore_252d:          { up: 'VIX is above its 1-year average',                         down: 'VIX is below its 1-year average' },
  vix_chg_5d:               { up: 'VIX has risen over the past week',                        down: 'VIX has been stable or falling' },
  rv_20d:                   { up: 'Recent realized volatility has been high',                 down: 'Recent realized volatility has been low' },
  rv_20d_pct:               { up: 'Realized volatility is above its historical average',     down: 'Realized volatility is below its historical average' },
  drawdown_pct_504d:        { up: 'SPY has pulled back from its 2-year high',                down: 'SPY is near its 2-year high' },
  ret_20d:                  { up: "SPY's 20-day return has been weak",                       down: 'SPY is up over the past 20 trading days' },
  momentum_20d:             { up: 'Recent price momentum has been negative',                 down: 'Recent price momentum has been positive' },
  dist_sma50:               { up: 'SPY has fallen below its 50-day average',                 down: 'SPY is holding above its 50-day average' },
  emv_level:                { up: 'The equity market volatility index is elevated',           down: 'The equity market volatility index is low' },
  days_in_regime_lag1:      { up: 'These conditions have lasted longer than usual',          down: 'These conditions are relatively recent' },
  turbulent_count_30d_lag1: { up: 'There have been more high-stress days recently',          down: 'High-stress days have been limited recently' },
  trend_code:               { up: "SPY's recent trend has turned negative",                  down: "SPY's recent trend remains positive" },
}

export function sentenceFor(feature: string, direction: 'up' | 'down'): string {
  return SENTENCE_TEMPLATES[feature]?.[direction] ?? labelFor(feature)
}
```

- [ ] **Step 4: Run — confirm tests pass**

```bash
cd frontend && npm test
```

Expected: `14 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/featureLabels.ts frontend/src/lib/__tests__/featureLabels.test.ts
git commit -m "feat: add sentenceFor and narrativeFragmentFor to featureLabels"
```

---

## Task 3: Add `buildDriversNarrative` and `getDriverHeadline` to `narratives.ts`

`buildDriversNarrative` synthesizes up to 2 pushing factors and up to 2 holding factors into a 2–3 sentence hero body using `narrativeFragmentFor` noun phrases — not raw `labelFor()` output.

**Files:**
- Modify: `frontend/src/lib/narratives.ts`
- Create: `frontend/src/lib/__tests__/narratives.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/__tests__/narratives.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildDriversNarrative, getDriverHeadline } from '../narratives'

describe('getDriverHeadline', () => {
  it('returns calm headline', () => {
    expect(getDriverHeadline('calm')).toBe('Conditions improved, but the model is still cautious')
  })
  it('returns elevated headline', () => {
    expect(getDriverHeadline('elevated')).toBe('Elevated conditions — the model is watching several factors')
  })
  it('returns turbulent headline', () => {
    expect(getDriverHeadline('turbulent')).toBe('Turbulent conditions — the model is registering significant stress signals')
  })
  it('is case-insensitive', () => {
    expect(getDriverHeadline('Calm')).toBe('Conditions improved, but the model is still cautious')
  })
  it('falls back gracefully for unknown regime', () => {
    expect(getDriverHeadline('unknown')).toBe('Current conditions: unknown')
  })
})

describe('buildDriversNarrative', () => {
  it('uses generic opening when no prior regime provided', () => {
    const result = buildDriversNarrative('calm', 0.15, [], [])
    expect(result).toContain('currently in a calm state')
  })

  it('uses transition opening when prior regime is confirmed different', () => {
    const result = buildDriversNarrative('calm', 0.45, [], [], 'elevated')
    expect(result).toContain('shifted to calm')
  })

  it('does NOT use transition opening when prior regime matches current', () => {
    const result = buildDriversNarrative('calm', 0.15, [], [], 'calm')
    expect(result).toContain('currently in a calm state')
    expect(result).not.toContain('shifted')
  })

  it('uses narrative fragment (not label) for single pushing feature', () => {
    const result = buildDriversNarrative('elevated', 0.63, ['drawdown_pct_504d'], [])
    expect(result).toContain('pullback from the 2-year high')
    expect(result).not.toContain('Drawdown relative to 2-year high')
  })

  it('combines two pushing fragments naturally', () => {
    const result = buildDriversNarrative('elevated', 0.63, ['drawdown_pct_504d', 'emv_level'], [])
    expect(result).toContain('pullback from the 2-year high')
    expect(result).toContain('rising equity market volatility index')
  })

  it('does NOT include pushing sentence when pushing features are empty', () => {
    const result = buildDriversNarrative('elevated', 0.63, [], [])
    expect(result).not.toContain('keeping the model cautious')
  })

  it('adds stability sentence when calm and risk < 0.20', () => {
    const result = buildDriversNarrative('calm', 0.10, [], [])
    expect(result).toContain('few notable stress signals')
  })

  it('does NOT add stability sentence when risk >= 0.20', () => {
    const result = buildDriversNarrative('calm', 0.25, [], [])
    expect(result).not.toContain('few notable stress signals')
  })

  it('adds offset sentence using narrative fragment for single holding feature', () => {
    const result = buildDriversNarrative('elevated', 0.50, [], ['ret_20d'])
    expect(result).toContain('positive 20-day momentum')
    expect(result).not.toContain('20-day SPY return')
  })

  it('combines two holding fragments in offset sentence', () => {
    const result = buildDriversNarrative('calm', 0.45, [], ['ret_20d', 'rv_20d'])
    expect(result).toContain('positive 20-day momentum')
    expect(result).toContain('low realized volatility')
  })
})
```

- [ ] **Step 2: Run — confirm it fails**

```bash
cd frontend && npm test
```

Expected: `buildDriversNarrative is not a function`.

- [ ] **Step 3: Implement in `narratives.ts`**

Replace the full contents of `frontend/src/lib/narratives.ts` with:

```ts
import { narrativeFragmentFor } from './featureLabels'

export function formatRisk(r: number): string {
  if (r === 0) return '0%'
  const pct = r * 100
  if (pct < 0.1) return '<0.1%'
  return `${pct.toFixed(1)}%`
}

export function buildCurrentStateNarrative(
  regime: string,
  risk: number,
  trend: string,
  vixLevel: number | null,
  vixChg1d: number | null,
): string {
  const regimeLower = regime.toLowerCase()
  const isStressed = regimeLower === 'elevated' || regimeLower === 'turbulent'

  const regimeSentence =
    regimeLower === 'calm' ? 'SPY is in a calm regime.' :
    regimeLower === 'elevated' ? 'The market is in an elevated stress state.' :
    regimeLower === 'turbulent' ? 'Market conditions are currently turbulent.' :
    `SPY is in a ${regimeLower} regime.`

  const riskSentence =
    risk < 0.05
      ? isStressed
        ? 'The model sees very low risk of further deterioration this week.'
        : 'The model sees very low risk of conditions worsening this week.'
      : risk < 0.20
      ? isStressed
        ? 'Near-term risk of further worsening is low.'
        : 'The model sees low risk of conditions changing soon.'
      : risk < 0.40
      ? 'The model sees moderate risk of conditions worsening over the next week.'
      : isStressed
        ? 'The model sees elevated risk of further deterioration — conditions may continue to worsen.'
        : 'The model sees elevated risk of conditions worsening soon.'

  const trendSentence =
    trend === 'uptrend' ? 'The trend is positive.' :
    trend === 'downtrend' ? 'The trend is negative.' :
    'The trend is neutral.'

  const vixDir =
    (vixChg1d ?? 0) > 0.5 ? 'rising' :
    (vixChg1d ?? 0) < -0.5 ? 'falling' : 'stable'

  const vixPart = vixLevel != null ? ` VIX is at ${vixLevel.toFixed(1)} and ${vixDir}.` : ''

  return `${regimeSentence} ${riskSentence} ${trendSentence}${vixPart}`
}

export const DRIVER_HEADLINES: Record<string, string> = {
  calm:      'Conditions improved, but the model is still cautious',
  elevated:  'Elevated conditions — the model is watching several factors',
  turbulent: 'Turbulent conditions — the model is registering significant stress signals',
}

export function getDriverHeadline(regime: string): string {
  return DRIVER_HEADLINES[regime.toLowerCase()] ?? `Current conditions: ${regime.toLowerCase()}`
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function buildDriversNarrative(
  regime: string,
  risk: number,
  topPushing: string[],
  topHolding: string[],
  priorRegime?: string | null,
): string {
  const regimeLower = regime.toLowerCase()
  const priorLower = priorRegime?.toLowerCase()

  // 1. Opening — only use transition phrasing when prior regime is explicitly different
  const opening =
    priorLower && priorLower !== regimeLower
      ? `After a period of ${priorLower} conditions, the market has shifted to ${regimeLower} today.`
      : `The market is currently in a ${regimeLower} state.`

  // 2. Pushing sentence — synthesize up to 2 fragments into natural copy
  let middle = ''
  const pushFragments = topPushing.slice(0, 2).map(f => narrativeFragmentFor(f, 'up'))
  if (risk > 0.40 && pushFragments.length > 0) {
    const pushStr = pushFragments.length === 2
      ? `${cap(pushFragments[0])} and ${pushFragments[1]}`
      : cap(pushFragments[0])
    const verb = pushFragments.length === 2 ? 'are' : 'is'
    middle = ` ${pushStr} ${verb} keeping the model cautious.`
  } else if (risk < 0.20 && regimeLower === 'calm') {
    middle = ' The model sees few notable stress signals at this time.'
  }

  // 3. Holding offset — synthesize up to 2 fragments
  let offset = ''
  const holdFragments = topHolding.slice(0, 2).map(f => narrativeFragmentFor(f, 'down'))
  if (risk >= 0.20 && holdFragments.length > 0) {
    const holdStr = holdFragments.length === 2
      ? `${holdFragments[0]} and ${holdFragments[1]}`
      : holdFragments[0]
    const verb = holdFragments.length === 2 ? 'are' : 'is'
    offset = ` At the same time, ${holdStr} ${verb} providing some offset.`
  }

  return `${opening}${middle}${offset}`.trim()
}
```

Example output for today's data (elevated→calm, 63% risk, drawdown+emv pushing, ret_20d+rv_20d holding):
> *After a period of elevated conditions, the market has shifted to calm today. A pullback from the 2-year high and a rising equity market volatility index are keeping the model cautious. At the same time, positive 20-day momentum and low realized volatility are providing some offset.*

- [ ] **Step 4: Run — confirm all tests pass**

```bash
cd frontend && npm test
```

Expected: all tests in both test files pass (14 + 11 = 25 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/narratives.ts frontend/src/lib/__tests__/narratives.test.ts
git commit -m "feat: add buildDriversNarrative and getDriverHeadline to narratives"
```

---

## Task 4: Rewrite `ModelDrivers.tsx`

**Files:**
- Modify: `frontend/src/pages/ModelDrivers.tsx`

- [ ] **Step 1: Replace `ModelDrivers.tsx` with the new layout**

Replace the full contents of `frontend/src/pages/ModelDrivers.tsx` with:

```tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import DriverBar from '../components/ui/DriverBar'
import { useModelDrivers } from '../hooks/useModelDrivers'
import { useCurrentState } from '../hooks/useCurrentState'
import { buildDriversNarrative, getDriverHeadline, formatRisk } from '../lib/narratives'
import { sentenceFor } from '../lib/featureLabels'
import { regimeColor } from '../lib/tokens'
import type { ThresholdSweepRow } from '../types/api'

const VOL_FEATURES = new Set([
  'rv_20d', 'rv_20d_pct', 'vix_level', 'vix_pct_504d',
  'vix_zscore_252d', 'vix_chg_5d', 'emv_level',
])
const DRAWDOWN_FEATURES = new Set(['drawdown_pct_504d'])

function buildForwardBullets(topPushingFeature: string | undefined): string[] {
  const b1 = VOL_FEATURES.has(topPushingFeature ?? '')
    ? 'Risk would likely rise if day-to-day volatility continues to climb'
    : DRAWDOWN_FEATURES.has(topPushingFeature ?? '')
    ? 'The model would become more concerned if the pullback from recent highs deepens'
    : 'Risk would likely rise if market stress indicators continue to rise'

  const b2 = b1.includes('pullback')
    ? 'Risk would likely rise if day-to-day volatility increases'
    : 'The model would become more concerned if the pullback from recent highs deepens'

  return [b1, b2, 'Risk would likely rise if high-stress days become more frequent over the next few weeks']
}

export default function ModelDrivers() {
  const { data, loading, error } = useModelDrivers()
  const { data: stateData } = useCurrentState()
  const [reliabilityOpen, setReliabilityOpen] = useState(false)

  if (loading) return <div className="p-6 text-slate-500 text-sm">Loading…</div>
  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>
  if (!data) return null

  const regime = (stateData?.regime ?? 'unknown').toLowerCase()
  const risk = stateData?.transition_risk ?? 0
  const rColor = risk > 0.40 ? '#f87171' : risk > 0.20 ? '#fbbf24' : '#4ade80'
  const rRegimeColor = regimeColor[regime] ?? regimeColor['unknown']

  const localEntries = Object.entries(data.local_explanation)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  const pushing = localEntries.filter(([, v]) => v > 0).slice(0, 3)
  const holding = localEntries.filter(([, v]) => v < 0).slice(0, 3)

  const priorRegime =
    stateData?.delta?.regime_changed && stateData.delta.prior_regime
      ? stateData.delta.prior_regime
      : null

  const narrative = buildDriversNarrative(
    regime, risk,
    pushing.map(([f]) => f),
    holding.map(([f]) => f),
    priorRegime,
  )

  const topImportance = [...data.global_importance]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5)
  const maxImp = topImportance[0]?.importance ?? 0.001

  const forwardBullets = buildForwardBullets(pushing[0]?.[0])

  const demoAction = stateData?.mode === 'demo'
    ? <span className="text-[10px] px-2 py-1 rounded" style={{ background: '#2d1f0a', color: '#fbbf24', border: '1px solid #92400e' }}>Demo data</span>
    : undefined

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar title="Model Drivers" subtitle="What is driving today's risk reading?" action={demoAction} />

      <div className="p-5 space-y-4">

        {/* ── Hero ── */}
        <div style={{ background: '#0c1520', border: '1px solid #1e3a5f', borderRadius: 8, padding: '16px 18px', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
              {stateData?.as_of_ts
                ? new Date(stateData.as_of_ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : '—'} · Today's reading
            </div>
            <div style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 800, lineHeight: 1.3, marginBottom: 10 }}>
              {getDriverHeadline(regime)}
            </div>
            <p style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.75, margin: 0 }}>
              {narrative}
            </p>
          </div>
          <div style={{ textAlign: 'center', minWidth: 72, flexShrink: 0 }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: rColor, lineHeight: 1, marginBottom: 3 }}>
              {formatRisk(risk)}
            </div>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', lineHeight: 1.4 }}>
              Weekly<br />transition risk
            </div>
            <div style={{ fontSize: 8.5, color: '#4a5568', lineHeight: 1.4, marginTop: 2 }}>
              Chance conditions<br />worsen this week
            </div>
            <div style={{
              display: 'inline-block', marginTop: 10, padding: '3px 8px', borderRadius: 99,
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              color: rRegimeColor,
              background: `${rRegimeColor}18`,
              border: `1px solid ${rRegimeColor}40`,
            }}>
              {stateData?.regime ?? '—'}
            </div>
          </div>
        </div>

        {/* ── Two-column ── */}
        <div className="grid grid-cols-2 gap-3">

          {/* Left: push/pull bullets */}
          <div style={{ background: '#080b12', border: '1px solid #151d2e', borderRadius: 6, padding: '12px 14px' }}>
            <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
              Why the model sees it this way today
            </div>
            {pushing.length === 0 && holding.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: 10, lineHeight: 1.5 }}>
                Today's factor breakdown is unavailable — showing global importance instead.
              </p>
            ) : (
              <>
                {pushing.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: '#f87171', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                      ↑ Pushing risk higher
                    </div>
                    {pushing.map(([feat]) => (
                      <div key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 4 }}>
                        <span style={{ color: '#f87171', fontSize: 11, marginTop: 1, flexShrink: 0 }}>•</span>
                        <span style={{ color: '#cbd5e1', fontSize: 10, lineHeight: 1.55 }}>{sentenceFor(feat, 'up')}</span>
                      </div>
                    ))}
                  </div>
                )}
                {holding.length > 0 && (
                  <>
                    <div style={{ borderTop: '1px solid #151d2e', margin: '0 0 8px' }} />
                    <div style={{ color: '#4ade80', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                      ↓ Holding risk in check
                    </div>
                    {holding.map(([feat]) => (
                      <div key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 4 }}>
                        <span style={{ color: '#4ade80', fontSize: 11, marginTop: 1, flexShrink: 0 }}>•</span>
                        <span style={{ color: '#cbd5e1', fontSize: 10, lineHeight: 1.55 }}>{sentenceFor(feat, 'down')}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {/* Right: global importance bars */}
          <div style={{ background: '#080b12', border: '1px solid #151d2e', borderRadius: 6, padding: '12px 14px' }}>
            <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
              What always drives the model most
            </div>
            <p style={{ color: '#4a5568', fontSize: 9, marginBottom: 10, lineHeight: 1.5 }}>
              Average influence across all historical periods — not just today.
            </p>
            {topImportance.map(d => (
              <DriverBar key={d.feature} feature={d.feature} importance={d.importance} maxImportance={maxImp} positive />
            ))}
            <p style={{ color: '#4a5568', fontSize: 9, marginTop: 10, lineHeight: 1.5 }}>
              Left panel shows <em>what is happening today</em>. This panel shows <em>what the model generally relies on most</em>.
            </p>
          </div>
        </div>

        {/* ── Forward-looking block ── */}
        <div style={{ background: '#0d0b18', border: '1px solid #2e1d48', borderRadius: 6, padding: '12px 14px' }}>
          <div style={{ color: '#a78bfa', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
            What would raise risk further
          </div>
          {forwardBullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
              <span style={{ color: '#a78bfa', flexShrink: 0, fontWeight: 700 }}>→</span>
              <span style={{ color: '#c4b5fd', fontSize: 10, lineHeight: 1.55 }}>{b}</span>
            </div>
          ))}
        </div>

        {/* ── Reliability accordion ── */}
        {data.threshold_sweep.length > 0 && (
          <div>
            <button
              onClick={() => setReliabilityOpen(o => !o)}
              className="w-full text-left"
              style={{
                background: '#080b12',
                border: '1px solid #151d2e',
                borderRadius: reliabilityOpen ? '6px 6px 0 0' : 6,
                padding: '9px 14px',
                cursor: 'pointer',
              }}
            >
              <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600 }}>
                {reliabilityOpen ? '▾' : '▸'} Model reliability and threshold tradeoffs
              </div>
              <div style={{ color: '#4a5568', fontSize: 9, marginTop: 2 }}>
                How often does flagging at different risk levels actually catch regime shifts?
              </div>
            </button>
            {reliabilityOpen && <ReliabilityTable rows={data.threshold_sweep} />}
          </div>
        )}

      </div>
    </motion.div>
  )
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—'
  return `${(v * 100).toFixed(0)}%`
}

function fmtDays(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—'
  return `${v.toFixed(0)} days`
}

function ReliabilityTable({ rows }: { rows: ThresholdSweepRow[] }) {
  return (
    <div style={{ background: '#080b12', border: '1px solid #151d2e', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '12px 14px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Alert threshold', 'Shifts caught', 'Avg. days early', 'False alarm rate'].map(h => (
              <th key={h} style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase', fontWeight: 600, textAlign: 'left', paddingBottom: 8, paddingRight: 8, borderBottom: '1px solid #151d2e' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.threshold}>
              <td style={{ color: '#f1f5f9', fontSize: 10, padding: '5px 8px 5px 0', borderBottom: '1px solid #0f1929' }}>
                {fmtPct(row.threshold)}
              </td>
              <td style={{ color: '#94a3b8', fontSize: 10, padding: '5px 8px 5px 0', borderBottom: '1px solid #0f1929' }}>
                {fmtPct(row.recall)}
              </td>
              <td style={{ color: '#94a3b8', fontSize: 10, padding: '5px 8px 5px 0', borderBottom: '1px solid #0f1929' }}>
                {fmtDays(row.avg_lead_time_days)}
              </td>
              <td style={{ color: '#94a3b8', fontSize: 10, padding: '5px 8px 5px 0', borderBottom: '1px solid #0f1929' }}>
                {fmtPct(row.false_alert_rate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: '#4a5568', fontSize: 9, marginTop: 10, lineHeight: 1.6 }}>
        <strong style={{ color: '#94a3b8' }}>How to read this:</strong> At a lower threshold, the model catches more regime shifts but also produces more false alarms. At a higher threshold, it is more selective — when it flags, it tends to be meaningful. The model is not designed to time market exits; it identifies when conditions are becoming stress-prone.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start dev server and visually verify**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` and navigate to the Model Drivers page. Verify:
- Hero body reads like a natural case brief (not "The model is watching Drawdown relative to 2-year high")
- Push/pull bullets use complete, natural English sentences
- "What would raise risk further" bullets use conditional framing ("Risk would likely rise if…")
- Reliability accordion collapses/expands; all table cells show a value or "—", never blank
- No console errors

- [ ] **Step 4: Run all unit tests one final time**

```bash
cd frontend && npm test
```

Expected: all 25 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ModelDrivers.tsx
git commit -m "feat: redesign Model Drivers page — Layout C newspaper front-page"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| Hero: headline from `DRIVER_HEADLINES`, case-brief narrative, large risk number | Task 4 |
| Hero narrative synthesizes up to 2 pushing + 2 holding via `narrativeFragmentFor` | Tasks 3, 4 |
| No `labelFor()` used directly inside hero narrative copy | Task 3 — uses `narrativeFragmentFor` instead |
| Left panel: plain-English push/pull bullets using `sentenceFor` | Task 4 |
| `sentenceFor` templates cautious and descriptive, not causal | Task 2 |
| Tightened templates for `days_in_regime_lag1` and `trend_code` | Task 2 |
| Right panel: global importance bars, top 5, existing `DriverBar` | Task 4 |
| "always vs. today" note below bars | Task 4 |
| Forward-looking block uses conditional framing | Task 4 `buildForwardBullets` |
| Reliability accordion collapsed by default | Task 4 `useState(false)` |
| All reliability cells defensively formatted (`fmtPct`, `fmtDays`) | Task 4 |
| Transition-opening only when `delta.regime_changed` + `prior_regime` confirmed | Tasks 3, 4 |
| No new files, no backend changes | ✓ |
| `_sync_snapshots` already implemented, no changes needed | ✓ |

**Placeholder scan:** None found — all steps include complete code.

**Type consistency:** `sentenceFor`, `narrativeFragmentFor` defined in Task 2 and used in Tasks 3 and 4. `buildDriversNarrative`, `getDriverHeadline`, `formatRisk` defined in Task 3 and used in Task 4. `ThresholdSweepRow`, `regimeColor` are pre-existing imports. All match.
