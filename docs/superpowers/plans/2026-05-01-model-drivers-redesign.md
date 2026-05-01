# Model Drivers Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Model Drivers page from two stacked panels to a newspaper-front-page layout with a hero case brief, plain-English push/pull bullets, global importance bars, a forward-looking block, and a collapsed reliability accordion.

**Architecture:** Three pure-function helpers (`sentenceFor`, `buildDriversNarrative`, `getDriverHeadline`) drive all text generation. `ModelDrivers.tsx` is a full rewrite that calls both `useCurrentState` and `useModelDrivers` hooks and composes the layout inline. No new files or components — logic lives in existing `lib/` files and the page itself.

**Tech Stack:** React 18, TypeScript, Tailwind, framer-motion, Vitest (added in Task 1 for unit-testing pure functions).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/lib/featureLabels.ts` | Modify | Add `SENTENCE_TEMPLATES` map and `sentenceFor(feature, direction)` |
| `frontend/src/lib/narratives.ts` | Modify | Add `DRIVER_HEADLINES`, `getDriverHeadline()`, `buildDriversNarrative()` |
| `frontend/src/pages/ModelDrivers.tsx` | Full rewrite | Layout C render: hero, two-column, forward block, reliability accordion |
| `frontend/src/lib/__tests__/featureLabels.test.ts` | Create | Unit tests for `sentenceFor` |
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

In `frontend/package.json`, add `"test": "vitest run"` to the `"scripts"` section. The scripts block should look like:
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

- [ ] **Step 3: Verify vitest runs (empty suite is fine)**

```bash
cd frontend && npm test
```

Expected output: `No test files found, exiting with code 0` or similar — no error.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add vitest for frontend unit tests"
```

---

## Task 2: Add `sentenceFor()` to `featureLabels.ts`

**Files:**
- Modify: `frontend/src/lib/featureLabels.ts`
- Create: `frontend/src/lib/__tests__/featureLabels.test.ts`

- [ ] **Step 1: Create the failing test**

Create `frontend/src/lib/__tests__/featureLabels.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sentenceFor } from '../featureLabels'

describe('sentenceFor', () => {
  it('returns a plain-English up sentence for drawdown', () => {
    expect(sentenceFor('drawdown_pct_504d', 'up')).toBe('SPY has pulled back from its 2-year high')
  })

  it('returns a plain-English down sentence for drawdown', () => {
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

  it('returns up sentence for turbulent_count_30d_lag1', () => {
    expect(sentenceFor('turbulent_count_30d_lag1', 'up')).toBe('There have been more high-stress days recently')
  })

  it('falls back to labelFor output for unknown features', () => {
    expect(sentenceFor('unknown_feature_xyz', 'up')).toBe('unknown_feature_xyz')
  })
})
```

- [ ] **Step 2: Run — confirm it fails**

```bash
cd frontend && npm test
```

Expected: `sentenceFor is not a function` or similar import error.

- [ ] **Step 3: Implement `sentenceFor` in `featureLabels.ts`**

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

const SENTENCE_TEMPLATES: Record<string, { up: string; down: string }> = {
  vix_pct_504d:             { up: 'VIX is elevated relative to its recent history',        down: 'VIX is low relative to its recent history' },
  vix_level:                { up: 'The VIX level is elevated',                             down: 'The VIX level is low' },
  vix_zscore_252d:          { up: 'VIX is above its 1-year average',                       down: 'VIX is below its 1-year average' },
  vix_chg_5d:               { up: 'VIX has risen over the past week',                      down: 'VIX has been stable or falling' },
  rv_20d:                   { up: 'Recent realized volatility has been high',               down: 'Recent realized volatility has been low' },
  rv_20d_pct:               { up: 'Realized volatility is above its historical average',   down: 'Realized volatility is below its historical average' },
  drawdown_pct_504d:        { up: 'SPY has pulled back from its 2-year high',              down: 'SPY is near its 2-year high' },
  ret_20d:                  { up: "SPY's 20-day return has been weak",                     down: 'SPY is up over the past 20 trading days' },
  momentum_20d:             { up: 'Recent price momentum has been negative',               down: 'Recent price momentum has been positive' },
  dist_sma50:               { up: 'SPY has fallen below its 50-day average',               down: 'SPY is holding above its 50-day average' },
  emv_level:                { up: 'The equity market volatility index is elevated',         down: 'The equity market volatility index is low' },
  days_in_regime_lag1:      { up: 'The current conditions have persisted for some time',   down: 'The current conditions are relatively recent' },
  turbulent_count_30d_lag1: { up: 'There have been more high-stress days recently',        down: 'High-stress days have been limited recently' },
  trend_code:               { up: 'The recent trend direction has been negative',          down: 'The recent trend direction has been positive' },
}

export function sentenceFor(feature: string, direction: 'up' | 'down'): string {
  return SENTENCE_TEMPLATES[feature]?.[direction] ?? labelFor(feature)
}
```

- [ ] **Step 4: Run — confirm tests pass**

```bash
cd frontend && npm test
```

Expected: `8 tests passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/featureLabels.ts frontend/src/lib/__tests__/featureLabels.test.ts
git commit -m "feat: add sentenceFor() to featureLabels — plain-English push/pull sentences"
```

---

## Task 3: Add `buildDriversNarrative` and `getDriverHeadline` to `narratives.ts`

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
  it('uses generic opening when no prior regime', () => {
    const result = buildDriversNarrative('calm', 0.15, [], [])
    expect(result).toContain('currently in a calm state')
  })

  it('uses transition opening when prior regime differs', () => {
    const result = buildDriversNarrative('calm', 0.15, [], [], 'elevated')
    expect(result).toContain('shifted to calm')
  })

  it('does NOT use transition opening when prior regime matches current', () => {
    const result = buildDriversNarrative('calm', 0.15, [], [], 'calm')
    expect(result).toContain('currently in a calm state')
    expect(result).not.toContain('shifted')
  })

  it('adds watching sentence when risk > 0.40 and pushing features exist', () => {
    const result = buildDriversNarrative('elevated', 0.63, ['drawdown_pct_504d'], [])
    expect(result).toContain('Drawdown relative to 2-year high')
  })

  it('does NOT add watching sentence when pushing features are empty', () => {
    const result = buildDriversNarrative('elevated', 0.63, [], [])
    expect(result).not.toContain('watching')
  })

  it('adds stability sentence when calm and risk < 0.20', () => {
    const result = buildDriversNarrative('calm', 0.10, [], [])
    expect(result).toContain('few notable stress signals')
  })

  it('does NOT add stability sentence when risk >= 0.20', () => {
    const result = buildDriversNarrative('calm', 0.25, [], [])
    expect(result).not.toContain('few notable stress signals')
  })

  it('adds offset sentence when risk >= 0.20 and holding features exist', () => {
    const result = buildDriversNarrative('elevated', 0.50, [], ['ret_20d'])
    expect(result).toContain('20-day SPY return')
  })
})
```

- [ ] **Step 2: Run — confirm it fails**

```bash
cd frontend && npm test
```

Expected: `buildDriversNarrative is not a function` or similar import error.

- [ ] **Step 3: Implement in `narratives.ts`**

Replace the full contents of `frontend/src/lib/narratives.ts` with:

```ts
import { labelFor } from './featureLabels'

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

  // 2. What the model is watching (only when risk is elevated and pushing features are known)
  const watching =
    risk > 0.40 && topPushing.length > 0
      ? ` The model is watching ${labelFor(topPushing[0])}, which has been a factor in recent readings.`
      : ''

  // 3. Stability affirmation (calm + low risk only)
  const stability =
    risk < 0.20 && regimeLower === 'calm'
      ? ' The model sees few notable stress signals at this time.'
      : ''

  // 4. Offset note (elevated risk + known holding features)
  const offset =
    risk >= 0.20 && topHolding.length > 0
      ? ` At the same time, ${labelFor(topHolding[0])} is providing some offset.`
      : ''

  return `${opening}${watching}${stability}${offset}`.trim()
}
```

- [ ] **Step 4: Run — confirm all tests pass**

```bash
cd frontend && npm test
```

Expected: all tests in both test files pass (8 + 9 = 17 tests).

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

const VOL_FEATURES = new Set(['rv_20d', 'rv_20d_pct', 'vix_level', 'vix_pct_504d', 'vix_zscore_252d', 'vix_chg_5d', 'emv_level'])
const DRAWDOWN_FEATURES = new Set(['drawdown_pct_504d'])

function forwardBullets(topPushingFeature: string | undefined): string[] {
  const bullet1 = VOL_FEATURES.has(topPushingFeature ?? '')
    ? 'Risk would likely rise if day-to-day volatility continues to climb'
    : DRAWDOWN_FEATURES.has(topPushingFeature ?? '')
    ? 'The model would become more concerned if the pullback from recent highs deepens'
    : 'Risk would likely rise if market stress indicators continue to rise'

  const bullet2 = bullet1.includes('pullback')
    ? 'Risk would likely rise if day-to-day volatility increases'
    : 'The model would become more concerned if the pullback from recent highs deepens'

  return [
    bullet1,
    bullet2,
    'Risk would likely rise if high-stress days become more frequent over the next few weeks',
  ]
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

  const localEntries = Object.entries(data.local_explanation).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
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

  const topImportance = [...data.global_importance].sort((a, b) => b.importance - a.importance).slice(0, 5)
  const maxImp = topImportance[0]?.importance ?? 0.001

  const bullets = forwardBullets(pushing[0]?.[0])

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

          {/* Left: push/pull */}
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

          {/* Right: global importance */}
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
          {bullets.map((b, i) => (
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
            {reliabilityOpen && (
              <ReliabilityTable rows={data.threshold_sweep} />
            )}
          </div>
        )}

      </div>
    </motion.div>
  )
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
                {(row.threshold * 100).toFixed(0)}%
              </td>
              <td style={{ color: '#94a3b8', fontSize: 10, padding: '5px 8px 5px 0', borderBottom: '1px solid #0f1929' }}>
                {(row.recall * 100).toFixed(0)}%
              </td>
              <td style={{ color: '#94a3b8', fontSize: 10, padding: '5px 8px 5px 0', borderBottom: '1px solid #0f1929' }}>
                {row.avg_lead_time_days.toFixed(0)} days
              </td>
              <td style={{ color: '#94a3b8', fontSize: 10, padding: '5px 8px 5px 0', borderBottom: '1px solid #0f1929' }}>
                {(row.false_alert_rate * 100).toFixed(0)}%
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

- [ ] **Step 3: Start the dev server and visually verify**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` and navigate to the Model Drivers page. Verify:
- Hero block renders with headline, narrative, and large risk number
- Two-column grid: left shows push/pull bullets, right shows importance bars
- "What would raise risk further" block appears in purple
- Reliability accordion collapses/expands on click
- Demo mode badge appears when `stateData.mode === 'demo'`
- No console errors

- [ ] **Step 4: Run all unit tests one final time**

```bash
cd frontend && npm test
```

Expected: all 17 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ModelDrivers.tsx
git commit -m "feat: redesign Model Drivers page — Layout C newspaper front-page"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|-----------------|-----------|
| Hero block: headline, narrative, large risk number, regime pill | Task 4 — `ModelDrivers.tsx` hero section |
| Left: plain-English push/pull bullets from SHAP | Task 4 — `sentenceFor` from Task 2 |
| Right: global importance bars | Task 4 — `DriverBar` component reused |
| "always vs. today" clarifying note | Task 4 — paragraph below bars |
| Forward-looking block (purple, conditional framing) | Task 4 — `forwardBullets()` helper |
| Reliability accordion collapsed by default | Task 4 — `useState(false)` + hidden by default |
| `buildDriversNarrative` with conditional transition opening | Task 3 |
| `getDriverHeadline` with softened DRIVER_HEADLINES | Task 3 |
| `sentenceFor` returning cautious descriptive sentences | Task 2 |
| Vitest unit coverage for all new pure functions | Tasks 2 and 3 |
| No backend changes | ✓ confirmed — only frontend files touched |
| No new components | ✓ `ReliabilityTable` is a local function, not a separate file |
| `_sync_snapshots` already implemented, no changes needed | ✓ no action required |

**Placeholder scan:** None found — all steps include complete code.

**Type consistency check:**
- `sentenceFor(feature: string, direction: 'up' | 'down'): string` — defined in Task 2, used in Task 4 ✓
- `buildDriversNarrative(regime, risk, topPushing, topHolding, priorRegime?)` — defined in Task 3, used in Task 4 ✓
- `getDriverHeadline(regime: string): string` — defined in Task 3, used in Task 4 ✓
- `formatRisk` — pre-existing export from `narratives.ts`, used in Task 4 ✓
- `ThresholdSweepRow` — pre-existing type from `types/api.ts`, used in Task 4 `ReliabilityTable` ✓
- `regimeColor` — pre-existing export from `tokens.ts`, used in Task 4 ✓
