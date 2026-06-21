# Scenario Explorer Driver Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blank "What's driving this scenario" section in Scenario Explorer with rich driver cards (empty state + active state with RAISES RISK / LOWERS RISK / OFFSETS cards + changed-input strip).

**Architecture:** Pure frontend change. Extract three pure helper functions to `frontend/src/lib/scenarioDriverCards.ts` for testability. Add `DRIVER_INTERP` lookup constant and replace variable declarations and JSX in `ScenarioExplorer.tsx`. No new React components, no backend changes, no API changes.

**Tech Stack:** React 18, TypeScript, Vite, Vitest (unit tests for pure functions only)

---

## Context for all tasks

**Dev server:** `cd /Users/kanuj/regime-radar/frontend && npm run dev` → http://localhost:5173

**Backend (for live data):** `cd /Users/kanuj/regime-radar && uvicorn src.api.main:app --reload --port 8000`

**Inline style pattern:** This codebase uses inline `style={{ }}` props with hex color strings throughout. Do NOT use Tailwind for colors or layout. Follow the pattern in existing components.

**Key colors:**
- Panel bg: `#0c1020`, border: `#151d2e`
- Card bg (primary): `#0d1526`, border: `#1e2a3a`
- Card bg (offset): `#070e1a`, border: `#132218`
- Risk-raising: `#f87171` (red), badge bg: `#3d1515`
- Risk-lowering / offset: `#4ade80` (green), badge bg: `#0a2212`
- Muted text: `#64748b`, dimmer: `#475569`, dimmer still: `#334155`

**File to modify:** `frontend/src/pages/ScenarioExplorer.tsx`

**File to create:** `frontend/src/lib/scenarioDriverCards.ts`

**Tests:** `frontend/src/lib/scenarioDriverCards.test.ts`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/lib/scenarioDriverCards.ts` | **Create** | Three pure helper functions: `isActiveDriverState`, `selectDriverCards`, `getChangedInputPills` |
| `frontend/src/lib/scenarioDriverCards.test.ts` | **Create** | Unit tests for all three helpers |
| `frontend/vite.config.ts` | **Modify** | Add `test` block to enable Vitest |
| `frontend/src/pages/ScenarioExplorer.tsx` | **Modify** | Add `DRIVER_INTERP`, replace variable declarations, replace driver section JSX |

---

## Task 1: Create pure helper module

**Files:**
- Create: `frontend/src/lib/scenarioDriverCards.ts`

- [ ] **Step 1: Read existing types to confirm imports**

```bash
grep -n 'DriverDelta\|ScenarioInputs\|SliderConfig' \
  /Users/kanuj/regime-radar/frontend/src/types/api.ts \
  /Users/kanuj/regime-radar/frontend/src/lib/sliderConfig.ts | head -20
```

Expected: `DriverDelta` in `types/api.ts`, `ScenarioInputs` and `SliderConfig` in `lib/sliderConfig.ts`.

- [ ] **Step 2: Create `scenarioDriverCards.ts`**

```typescript
// frontend/src/lib/scenarioDriverCards.ts
import type { DriverDelta } from '../types/api'
import type { ScenarioInputs, SliderConfig } from './sliderConfig'

export interface SelectedDriverCards {
  primary: DriverDelta | null
  secondary: DriverDelta | null
  offset: DriverDelta | null
}

export interface ChangedPill {
  key: string
  label: string
  delta: number
}

/** Active when at least one driver has |delta_value| >= 0.03 */
export function isActiveDriverState(driverDeltas: DriverDelta[]): boolean {
  return driverDeltas.some(d => Math.abs(d.delta_value) >= 0.03)
}

/**
 * Selects up to 3 cards:
 *   primary  — largest |delta_value| overall, must be >= 0.03 or all return null
 *   secondary — same sign as primary, |delta_value| >= 0.03
 *   offset   — opposite sign to primary, |delta_value| >= 0.01
 *
 * Self-guarding: if no driver reaches the 0.03 active threshold, returns all nulls.
 * Callers do not need to check isActiveDriverState() before destructuring.
 */
export function selectDriverCards(driverDeltas: DriverDelta[]): SelectedDriverCards {
  if (!driverDeltas.length) return { primary: null, secondary: null, offset: null }

  const sorted = [...driverDeltas].sort(
    (a, b) => Math.abs(b.delta_value) - Math.abs(a.delta_value),
  )
  const primary = sorted[0]

  // If even the strongest driver doesn't reach the active threshold, show nothing.
  if (Math.abs(primary.delta_value) < 0.03) {
    return { primary: null, secondary: null, offset: null }
  }

  const primarySign = Math.sign(primary.delta_value)

  const secondary =
    sorted
      .slice(1)
      .find(
        d =>
          Math.sign(d.delta_value) === primarySign &&
          Math.abs(d.delta_value) >= 0.03,
      ) ?? null

  const offset =
    sorted.find(
      d =>
        Math.sign(d.delta_value) !== primarySign &&
        Math.abs(d.delta_value) >= 0.01,
    ) ?? null

  return { primary, secondary, offset }
}

/**
 * Returns one entry per slider input that changed from baseline by > 0.001.
 * Uses SLIDER_CONFIG label strings for user-readable pill text.
 *
 * pill.delta is a signed change magnitude (positive = user moved value up).
 * The component should format it with formatDriverVal(key, Math.abs(delta)) because
 * change magnitude shares the same units as the absolute value for all current
 * driver fields. If that assumption changes, add a dedicated formatPillDelta helper.
 */
export function getChangedInputPills(
  inputs: ScenarioInputs,
  baselineInputs: Record<string, number>,
  sliderConfig: SliderConfig[],
): ChangedPill[] {
  return sliderConfig
    .filter(cfg => {
      const current = inputs[cfg.key] ?? 0
      const baseline = baselineInputs[cfg.key] ?? current
      return Math.abs(current - baseline) > 0.001
    })
    .map(cfg => ({
      key: cfg.key,
      label: cfg.label,
      delta: (inputs[cfg.key] ?? 0) - (baselineInputs[cfg.key] ?? inputs[cfg.key] ?? 0),
    }))
}
```

---

## Task 2: Configure Vitest and write tests

**Files:**
- Modify: `frontend/vite.config.ts`
- Create: `frontend/src/lib/scenarioDriverCards.test.ts`

- [ ] **Step 1: Check if vitest is installed**

```bash
grep vitest /Users/kanuj/regime-radar/frontend/package.json
```

If not present, run:
```bash
cd /Users/kanuj/regime-radar/frontend && npm install -D vitest
```

- [ ] **Step 2: Read vite.config.ts before editing**

```bash
cat /Users/kanuj/regime-radar/frontend/vite.config.ts
```

- [ ] **Step 3: Add test block to vite.config.ts**

Add `test` to the existing `defineConfig` call. The full file should become:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
```

- [ ] **Step 4: Write the failing tests**

```typescript
// frontend/src/lib/scenarioDriverCards.test.ts
import { describe, it, expect } from 'vitest'
import {
  isActiveDriverState,
  selectDriverCards,
  getChangedInputPills,
} from './scenarioDriverCards'
import type { DriverDelta } from '../types/api'
import type { SliderConfig, ScenarioInputs } from './sliderConfig'

const d = (feature: string, delta_value: number): DriverDelta => ({
  feature,
  plain_label: feature,
  delta_value,
})

const MINI_SLIDER_CONFIG: SliderConfig[] = [
  { key: 'vix_level', label: 'VIX Level', helper: '', min: 5, max: 80, step: 0.5, calmMax: 18, stressMin: 28 },
  { key: 'ret_20d', label: '20-day Return', helper: '', min: -0.3, max: 0.3, step: 0.01, calmMax: 0.05, stressMin: -0.05 },
] as SliderConfig[]

const BASELINE = { vix_level: 15.2, ret_20d: 0.04 }

const baseInputs = (overrides: Partial<ScenarioInputs> = {}): ScenarioInputs =>
  ({
    vix_level: 15.2,
    vix_chg_5d: 0,
    rv_20d_pct: 0,
    drawdown_pct_504d: 0,
    ret_20d: 0.04,
    dist_sma50: 0,
    ...overrides,
  } as ScenarioInputs)

// ── isActiveDriverState ───────────────────────────────────────────────────────

describe('isActiveDriverState', () => {
  it('returns false when all deltas are below 0.03', () => {
    expect(isActiveDriverState([d('a', 0.01), d('b', 0.02)])).toBe(false)
  })

  it('returns true when any delta meets 0.03', () => {
    expect(isActiveDriverState([d('a', 0.01), d('b', 0.03)])).toBe(true)
  })

  it('returns false for empty array', () => {
    expect(isActiveDriverState([])).toBe(false)
  })

  it('uses absolute value — negative deltas count', () => {
    expect(isActiveDriverState([d('a', -0.05)])).toBe(true)
  })
})

// ── selectDriverCards ─────────────────────────────────────────────────────────

describe('selectDriverCards', () => {
  it('returns all nulls for empty input', () => {
    expect(selectDriverCards([])).toEqual({ primary: null, secondary: null, offset: null })
  })

  it('picks the largest |delta_value| as primary', () => {
    const { primary } = selectDriverCards([d('a', 0.1), d('b', 0.5), d('c', 0.3)])
    expect(primary?.feature).toBe('b')
  })

  it('secondary shares sign with primary and meets 0.03 threshold', () => {
    const { secondary } = selectDriverCards([d('a', 0.5), d('b', 0.04), d('c', -0.2)])
    expect(secondary?.feature).toBe('b')
  })

  it('secondary is null when second same-sign delta is below 0.03', () => {
    const { secondary } = selectDriverCards([d('a', 0.5), d('b', 0.02), d('c', -0.2)])
    expect(secondary).toBeNull()
  })

  it('offset has opposite sign to primary and meets 0.01 threshold', () => {
    const { offset } = selectDriverCards([d('a', 0.5), d('b', 0.3), d('c', -0.05)])
    expect(offset?.feature).toBe('c')
  })

  it('offset is null when opposite-sign delta is below 0.01', () => {
    const { offset } = selectDriverCards([d('a', 0.5), d('c', -0.005)])
    expect(offset).toBeNull()
  })

  it('handles calm scenario where primary has negative delta', () => {
    const { primary, secondary, offset } = selectDriverCards([
      d('vix_level', -0.4),
      d('drawdown', -0.2),
      d('ret', 0.1),
    ])
    expect(primary?.feature).toBe('vix_level')
    expect(secondary?.feature).toBe('drawdown')
    expect(offset?.feature).toBe('ret')
  })

  it('offset uses the opposite-sign entry with the largest |delta_value|', () => {
    const { offset } = selectDriverCards([d('a', 0.5), d('b', -0.3), d('c', -0.1)])
    expect(offset?.feature).toBe('b')
  })

  it('returns all nulls when primary delta is below active threshold', () => {
    expect(selectDriverCards([d('a', 0.02), d('b', 0.01)])).toEqual({
      primary: null, secondary: null, offset: null,
    })
  })

  it('returns primary + null secondary + offset when no same-sign secondary qualifies', () => {
    // primary exists, b is same-sign but below 0.03, c is opposite-sign above 0.01
    const { primary, secondary, offset } = selectDriverCards([
      d('a', 0.5),
      d('b', 0.02),
      d('c', -0.05),
    ])
    expect(primary?.feature).toBe('a')
    expect(secondary).toBeNull()
    expect(offset?.feature).toBe('c')
  })
})

// ── getChangedInputPills ──────────────────────────────────────────────────────

describe('getChangedInputPills', () => {
  it('returns empty when nothing changed', () => {
    const result = getChangedInputPills(baseInputs(), BASELINE, MINI_SLIDER_CONFIG)
    expect(result).toHaveLength(0)
  })

  it('returns a pill for a changed input', () => {
    const result = getChangedInputPills(
      baseInputs({ vix_level: 18.3 }),
      BASELINE,
      MINI_SLIDER_CONFIG,
    )
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('vix_level')
    expect(result[0].label).toBe('VIX Level')
    expect(result[0].delta).toBeCloseTo(3.1)
  })

  it('filters out floating-point noise below 0.001', () => {
    const result = getChangedInputPills(
      baseInputs({ vix_level: 15.2000001 }),
      BASELINE,
      MINI_SLIDER_CONFIG,
    )
    expect(result).toHaveLength(0)
  })

  it('reports correct sign for negative delta', () => {
    const result = getChangedInputPills(
      baseInputs({ ret_20d: 0.01 }),
      BASELINE,
      MINI_SLIDER_CONFIG,
    )
    expect(result[0].delta).toBeCloseTo(-0.03)
  })

  it('only returns pills for keys present in sliderConfig', () => {
    const result = getChangedInputPills(
      baseInputs({ vix_level: 20, vix_chg_5d: 5 }),
      { ...BASELINE, vix_chg_5d: 0 },
      MINI_SLIDER_CONFIG, // only has vix_level and ret_20d
    )
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('vix_level')
  })
})
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/kanuj/regime-radar/frontend && npx vitest run src/lib/scenarioDriverCards.test.ts
```

Expected output: all tests pass (green). If any fail, fix the helper before continuing.

- [ ] **Step 6: Commit**

```bash
cd /Users/kanuj/regime-radar
git add frontend/src/lib/scenarioDriverCards.ts \
        frontend/src/lib/scenarioDriverCards.test.ts \
        frontend/vite.config.ts
git commit -m "feat: add scenarioDriverCards helpers with vitest tests"
```

---

## Task 3: Add DRIVER_INTERP and update variable declarations in ScenarioExplorer

**Files:**
- Modify: `frontend/src/pages/ScenarioExplorer.tsx`

- [ ] **Step 1: Read the file to locate exact lines**

```bash
grep -n 'positiveDrivers\|offsetDriver\|import.*scenarioDriverCards\|DRIVER_INTERP' \
  /Users/kanuj/regime-radar/frontend/src/pages/ScenarioExplorer.tsx
```

- [ ] **Step 2: Add import at the top of ScenarioExplorer.tsx**

Find the last `import` line at the top of the file. Add immediately after it:

```typescript
import {
  isActiveDriverState,
  selectDriverCards,
  getChangedInputPills,
} from '../lib/scenarioDriverCards'
```

- [ ] **Step 3: Add DRIVER_INTERP constant**

Find `const REGIME_HISTORY_FEATURES` near the top of the file (module-level constant). Add `DRIVER_INTERP` directly before it:

```typescript
const DRIVER_INTERP: Record<string, { raisesRisk: string; lowersRisk: string }> = {
  drawdown_pct_504d: {
    raisesRisk: 'Deepening drawdown is the primary stress signal the model is responding to.',
    lowersRisk: 'Drawdown remains contained — limiting how much stress can build.',
  },
  vix_level: {
    raisesRisk: 'Fear gauge rising — adds to the stress reading.',
    lowersRisk: 'VIX is low — suppressing the stress reading.',
  },
  vix_chg_5d: {
    raisesRisk: 'Fear is accelerating over the past week — adds momentum to the stress signal.',
    lowersRisk: 'Fear has been receding — partially offsetting other stress inputs.',
  },
  rv_20d_pct: {
    raisesRisk: 'Realized volatility is elevated relative to recent history — amplifying the regime signal.',
    lowersRisk: 'Volatility is below recent norms — a calming factor.',
  },
  ret_20d: {
    raisesRisk: 'Recent returns are weak — reinforcing the stress reading.',
    lowersRisk: 'Medium-term momentum is holding — limiting how much the stress reading can rise.',
  },
  dist_sma50: {
    raisesRisk: 'Price is stretched below its 50-day average — adding to the stress signal.',
    lowersRisk: 'Price remains above its 50-day average — a stabilizing factor.',
  },
}
```

- [ ] **Step 4: Replace the old variable declarations inside the component**

Find (around line 118):
```typescript
  const positiveDrivers = data?.driver_deltas.filter(d => d.delta_value > 0) ?? []
  const offsetDriver = (
    data?.driver_deltas?.length &&
    data.driver_deltas[0].delta_value > 0
  ) ? (data.driver_deltas.find(d => d.delta_value < 0) ?? null) : null
```

Replace with:
```typescript
  const isActive = isActiveDriverState(data?.driver_deltas ?? [])
  const { primary, secondary, offset } = selectDriverCards(data?.driver_deltas ?? [])
  const changedPills = data
    ? getChangedInputPills(inputs, data.baseline_inputs, SLIDER_CONFIG)
    : []
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/kanuj/regime-radar/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to the new variables. If there are errors about `positiveDrivers` or `offsetDriver` being used elsewhere, that's expected — they're removed in Task 4.

---

## Task 4: Replace the driver section JSX

**Files:**
- Modify: `frontend/src/pages/ScenarioExplorer.tsx`

- [ ] **Step 1: Locate the exact driver section JSX**

```bash
grep -n 'What.*driving\|positiveDrivers\|offsetDriver\|Biggest input' \
  /Users/kanuj/regime-radar/frontend/src/pages/ScenarioExplorer.tsx
```

Note the line numbers of the `<Panel title="What's driving this scenario">` block and its closing `</Panel>`.

- [ ] **Step 2: Read the section before editing**

Read from the opening `<Panel title="What's driving this scenario">` line to its closing `</Panel>` to confirm the full extent of what you're replacing.

- [ ] **Step 3: Replace the entire driver Panel contents**

Find the `<Panel title="What's driving this scenario">` block (everything from `<Panel title="What's driving this scenario">` to its matching `</Panel>`).

Replace it with:

```tsx
              <Panel title="What's driving this scenario">
                {data === null ? (
                  /* ── Loading state ── data not yet resolved */
                  <div style={{
                    textAlign: 'center', padding: '24px 0',
                    fontSize: 10, color: '#334155', letterSpacing: '0.05em',
                  }}>
                    —
                  </div>
                ) : !isActive ? (
                  /* ── Empty state ── data resolved, no driver meets threshold */
                  <div style={{
                    border: '1.5px dashed #1e2a3a',
                    borderRadius: 8,
                    padding: '28px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    textAlign: 'center',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: '#0d1526', border: '1px solid #1e2a3a',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, color: '#334155',
                    }}>
                      ⇄
                    </div>
                    <div className="text-[11px] font-semibold" style={{ color: '#475569' }}>
                      No strong driver signal yet
                    </div>
                    <div className="text-[10px]" style={{ color: '#334155', maxWidth: 220, lineHeight: 1.6 }}>
                      Adjust a slider or select a preset to see what starts driving the scenario away from the current market.
                    </div>
                  </div>
                ) : (
                  /* ── Active state ── */
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {/* Primary and secondary amplifier/lowering cards */}
                      {([primary, secondary] as const).filter(Boolean).map((card) => {
                        const raisesRisk = card!.delta_value > 0
                        const interp = DRIVER_INTERP[card!.feature]
                        const interpText = interp
                          ? (raisesRisk ? interp.raisesRisk : interp.lowersRisk)
                          : 'This scenario differs from the current market, but no single driver clearly dominates the change.'
                        return (
                          <div key={card!.feature} style={{
                            background: '#0d1526',
                            border: '1px solid #1e2a3a',
                            borderRadius: 7, padding: '9px 11px',
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                          }}>
                            <div style={{
                              fontSize: 18, lineHeight: 1, marginTop: 1,
                              flexShrink: 0, color: raisesRisk ? '#f87171' : '#4ade80',
                            }}>
                              {raisesRisk ? '↑' : '↓'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="text-[10px] font-bold" style={{ color: '#e2e8f0' }}>
                                {card!.plain_label}
                              </div>
                              <div className="text-[9px] mt-0.5" style={{
                                color: '#475569', display: 'flex', alignItems: 'center', gap: 4,
                              }}>
                                <span style={{ color: '#64748b' }}>
                                  {formatDriverVal(card!.feature, data!.baseline_inputs[card!.feature] ?? 0)}
                                </span>
                                <span>→</span>
                                <span style={{ color: raisesRisk ? '#f87171' : '#4ade80' }}>
                                  {formatDriverVal(card!.feature, inputs[card!.feature as keyof typeof inputs] ?? 0)}
                                </span>
                              </div>
                              <div className="text-[9px] mt-1" style={{
                                color: '#64748b', fontStyle: 'italic', lineHeight: 1.5,
                              }}>
                                {interpText}
                              </div>
                            </div>
                            <div style={{
                              fontSize: 8, fontWeight: 800, letterSpacing: '0.05em',
                              padding: '2px 7px', borderRadius: 10, flexShrink: 0,
                              marginTop: 1, whiteSpace: 'nowrap',
                              background: raisesRisk ? '#3d1515' : '#0a2212',
                              color: raisesRisk ? '#f87171' : '#4ade80',
                            }}>
                              {raisesRisk ? 'RAISES RISK' : 'LOWERS RISK'}
                            </div>
                          </div>
                        )
                      })}

                      {/* Partial offset divider + offset card (conditional) */}
                      {offset && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 1, background: '#151d2e' }} />
                            <span style={{
                              fontSize: 8, color: '#1e2a3a',
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                            }}>
                              partial offset
                            </span>
                            <div style={{ flex: 1, height: 1, background: '#151d2e' }} />
                          </div>
                          {/*
                            Offset card: arrow AND badge both use the offset's own sign color.
                            Badge text is always "OFFSETS" — the role label is the same whether
                            the primary is stress-raising or stress-lowering. A positive-delta
                            offset in a calm scenario is still an offset, just a red one.
                          */}
                          <div style={{
                            background: '#070e1a', border: '1px solid #132218',
                            borderRadius: 7, padding: '9px 11px',
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                          }}>
                            {(() => {
                              const offsetRaises = offset.delta_value > 0
                              const offsetColor = offsetRaises ? '#f87171' : '#4ade80'
                              const interpEntry = DRIVER_INTERP[offset.feature]
                              const interpText = interpEntry
                                ? (offsetRaises ? interpEntry.raisesRisk : interpEntry.lowersRisk)
                                : 'This scenario differs from the current market, but no single driver clearly dominates the change.'
                              return (
                                <>
                                  <div style={{
                                    fontSize: 18, lineHeight: 1, marginTop: 1,
                                    flexShrink: 0, color: offsetColor,
                                  }}>
                                    {offsetRaises ? '↑' : '↓'}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="text-[10px] font-bold" style={{ color: '#e2e8f0' }}>
                                      {offset.plain_label}
                                    </div>
                                    <div className="text-[9px] mt-0.5" style={{
                                      color: '#475569', display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                      <span style={{ color: '#64748b' }}>
                                        {formatDriverVal(offset.feature, data!.baseline_inputs[offset.feature] ?? 0)}
                                      </span>
                                      <span>→</span>
                                      <span style={{ color: offsetColor }}>
                                        {formatDriverVal(offset.feature, inputs[offset.feature as keyof typeof inputs] ?? 0)}
                                      </span>
                                    </div>
                                    <div className="text-[9px] mt-1" style={{
                                      color: '#64748b', fontStyle: 'italic', lineHeight: 1.5,
                                    }}>
                                      {interpText}
                                    </div>
                                  </div>
                                  <div style={{
                                    fontSize: 8, fontWeight: 800, letterSpacing: '0.05em',
                                    padding: '2px 7px', borderRadius: 10, flexShrink: 0,
                                    marginTop: 1, whiteSpace: 'nowrap',
                                    background: offsetRaises ? '#3d1515' : '#0a2212',
                                    color: offsetColor,
                                  }}>
                                    OFFSETS
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Changed-input strip */}
                    {changedPills.length > 0 && (
                      <div style={{
                        marginTop: 10, paddingTop: 10, borderTop: '1px solid #0d1526',
                        display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
                      }}>
                        <span style={{
                          fontSize: 8, color: '#334155', fontWeight: 600,
                          textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 2,
                        }}>
                          Changed:
                        </span>
                        {changedPills.map(pill => (
                          <span key={pill.key} style={{
                            fontSize: 9, padding: '2px 8px', borderRadius: 10,
                            background: '#0d1526', border: '1px solid #1e2a3a',
                            color: '#64748b', display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            {pill.label}
                            {' '}
                            <span style={{ color: pill.delta > 0 ? '#f87171' : '#4ade80' }}>
                              {pill.delta > 0 ? '↑' : '↓'}{' '}
                              {formatDriverVal(pill.key, Math.abs(pill.delta))}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Panel>
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
cd /Users/kanuj/regime-radar/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 5: Run the dev server and test manually**

```bash
cd /Users/kanuj/regime-radar/frontend && npm run dev
```

Open http://localhost:5173 → navigate to Scenario Explorer.

**Verify empty state:**
- Default load (reset to current market): section shows dashed border, "No strong driver signal yet" title, sub-copy instruction

**Verify active state — preset:**
- Click "Crisis Peak" preset: should see 2 amplifier cards (RAISES RISK, red), a "partial offset" divider if an offset exists, optional OFFSETS card (green), and changed-input pills at the bottom

**Verify active state — manual sliders:**
- Move VIX Level up significantly (e.g., to 35): at least one RAISES RISK card appears, baseline→scenario values show correctly
- Move VIX Level back down to baseline: section returns to empty state

**Verify calm scenario:**
- Click "Calm Recovery" preset: cards show LOWERS RISK (green arrows), not RAISES RISK

**Verify changed-input strip:**
- After adjusting multiple sliders, pills appear at the bottom listing only changed inputs with direction arrows
- After reset, no pills shown

- [ ] **Step 6: Run tests one final time**

```bash
cd /Users/kanuj/regime-radar/frontend && npx vitest run src/lib/scenarioDriverCards.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/kanuj/regime-radar
git add frontend/src/pages/ScenarioExplorer.tsx
git commit -m "feat: replace scenario driver section with rich cards + empty state

- Empty: dashed border, icon, 'No strong driver signal yet'
- Active: primary/secondary RAISES/LOWERS RISK cards, optional
  OFFSETS card with partial-offset divider, changed-input strip
- State keyed on driver_deltas threshold, not transition-risk delta"
```

- [ ] **Step 8: Push**

```bash
git push
```

---

## Self-review checklist

- [x] **Spec § loading state** → Task 4: `data === null` shows minimal `—` placeholder, distinct from empty state ✓
- [x] **Spec § empty state** → Task 4: `data !== null && !isActive` shows dashed border, icon, "No strong driver signal yet", sub-copy ✓
- [x] **Spec § active state condition** → `isActiveDriverState` in Task 1, tested in Task 2 ✓
- [x] **Spec § selectDriverCards self-guarding** → returns all nulls when primary < 0.03, no external guard needed ✓
- [x] **Spec § card selection** → `selectDriverCards` in Task 1, tested in Task 2 (including primary-only + offset case) ✓
- [x] **Spec § bidirectional** → RAISES RISK / LOWERS RISK per card's own sign — no branching on overall delta ✓
- [x] **Spec § DRIVER_INTERP** → added as module-level const in Task 3, not in narratives.ts ✓
- [x] **Spec § partial offset divider** → conditional on `offset !== null` ✓
- [x] **Spec § OFFSETS badge semantics** → arrow + badge both use sign-appropriate color; text always "OFFSETS"; comment explains bidirectional intent ✓
- [x] **Spec § changed-input strip** → `getChangedInputPills` in Task 1, tested, rendered in Task 4 ✓
- [x] **Spec § pill delta formatting** → uses `formatDriverVal(key, Math.abs(delta))`; JSDoc on helper explains the unit-sharing assumption and when to break it ✓
- [x] **Spec § pill labels** → uses `cfg.label` from SLIDER_CONFIG (e.g., "VIX Level", "Drawdown Severity") ✓
- [x] **Spec § fallback copy** → "This scenario differs from the current market, but no single driver clearly dominates the change." ✓
- [x] **Spec § what is NOT changing** → verdict, ProbabilityTripod, alert threshold, left column, narratives.ts, backend — none touched ✓
- [x] **No placeholders** → all steps have complete code ✓
- [x] **Type consistency** → `primary`, `secondary`, `offset` used consistently across Tasks 3 and 4; `changedPills` matches `ChangedPill[]` type ✓
