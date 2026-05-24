# RegimeRadar — Graph & Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild RegimeRadar's chart system and four pages (History, Event Replay, Signal Breakdown, Scenario Explorer) so every page inherits the "Cinematic Instrument" brand DNA already established in Current State.

**Architecture:** Phase 1 builds the shared foundation (token scale, unified tooltip, generic regime-band builder, ChartShell wrapper, ChartAnnotation, Scrubber, SegmentedControl). Phases 2–5 adopt those primitives page by page. No page work starts before Phase 1 is complete — every subsequent task depends on these primitives existing.

**Tech Stack:** React 18 + TypeScript, recharts 3.8, framer-motion 12, Tailwind v4, Vitest (`npm run test` in `frontend/`), Playwright (`npm run test:smoke`). Backend: FastAPI + Python at `src/api/routes.py`.

**Spec:** `docs/superpowers/specs/2026-05-24-graph-page-redesign-design.md`

---

## File map

**New files**
| File | Purpose |
|------|---------|
| `frontend/src/components/charts/ChartShell.tsx` | Panel wrapper for all major recharts charts |
| `frontend/src/components/charts/ChartAnnotation.tsx` | Pinned date marker + glass callout |
| `frontend/src/components/charts/RegimeBands.tsx` | Recharts `<ReferenceArea>` renderer for regime bands |
| `frontend/src/components/charts/Scrubber.tsx` | Play/pause transport + draggable playhead |
| `frontend/src/components/ui/SegmentedControl.tsx` | Shared event/option selector |
| `frontend/src/components/ui/ScenarioSlider.tsx` | Compact labeled range slider with sensitivity dot |
| `frontend/src/components/ui/ReliabilityTable.tsx` | Extracted from `ModelDrivers.tsx` |
| `frontend/src/hooks/useScrubber.ts` | Playback state + frame timer logic |
| `frontend/src/lib/__tests__/chartUtils.test.ts` | Tests for `buildRegimeBands` |
| `frontend/src/hooks/__tests__/useScrubber.test.ts` | Tests for playback logic |

**Modified files**
| File | Change |
|------|--------|
| `frontend/src/lib/tokens.ts` | Add `typography` + `spacing` exports |
| `frontend/src/lib/chartUtils.ts` | Make `buildRegimeBands` generic; add `RegimeBands` re-export |
| `frontend/src/components/charts/ChartTooltip.tsx` | Multi-series support; adopt `colors.*` tokens |
| `frontend/src/components/charts/RegimeChart.tsx` | Use `ChartShell`, `RegimeBands`, consolidated tooltip |
| `frontend/src/components/charts/RiskLineChart.tsx` | Use `ChartShell`, consolidated tooltip |
| `frontend/src/components/charts/EventReplayChart.tsx` | Use `ChartShell`, `RegimeBands`, `ChartAnnotation`, playhead line |
| `frontend/src/components/charts/MiniRegimeChart.tsx` | Use `ChartTooltip` (only change — CSS gradient stays) |
| `frontend/src/api/client.ts` | Add `end` param to `historicalState` |
| `frontend/src/hooks/useHistoricalState.ts` | Accept `{ start, end }` |
| `frontend/src/pages/History.tsx` | Linked stack + companion feed column + brush + annotation linking |
| `frontend/src/pages/EventReplay.tsx` | Scrubber, live stats, SegmentedControl |
| `frontend/src/pages/ModelDrivers.tsx` | Token/Panel migration; ContributionChart; hover-to-focus |
| `frontend/src/components/AnalogCard.tsx` | Token palette (remove `bg-white/[0.03]`) |
| `frontend/src/components/ClosestHistoricalSetups.tsx` | Token palette |
| `frontend/src/pages/ScenarioExplorer.tsx` | Balanced split layout, sticky output, ScenarioSlider, collapsible groups |
| `frontend/src/components/charts/ProbabilityTripod.tsx` | Larger numerics + stronger glow |

---

## Phase 1 — Chart System Foundation

### Task 1: Typography + spacing tokens

**Files:**
- Modify: `frontend/src/lib/tokens.ts`

- [ ] **Write the failing test** (`frontend/src/lib/__tests__/tokens.test.ts`)

```typescript
import { describe, it, expect } from 'vitest'
import { typography, spacing, colors } from '../tokens'

describe('typography tokens', () => {
  it('microLabel uses textMuted color', () => {
    expect(typography.microLabel.color).toBe(colors.textMuted)
  })
  it('statXl is largest at 52', () => {
    expect(typography.statXl.fontSize).toBe(52)
    expect(typography.statXl.fontWeight).toBe(900)
  })
})

describe('spacing tokens', () => {
  it('pageX is 1.5rem', () => {
    expect(spacing.pageX).toBe('1.5rem')
  })
})
```

- [ ] **Run test to verify it fails**

```bash
cd frontend && npm run test -- lib/__tests__/tokens.test.ts
```
Expected: `typography is not exported`

- [ ] **Add to `frontend/src/lib/tokens.ts`** (append after the existing exports)

```typescript
export const typography = {
  microLabel: { fontSize: 9, letterSpacing: '0.10em', textTransform: 'uppercase' as const, color: colors.textMuted },
  sectionTitle: { fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' as const },
  statSm:  { fontSize: 22, fontWeight: 800 },
  statMd:  { fontSize: 32, fontWeight: 800 },
  statLg:  { fontSize: 40, fontWeight: 900 },
  statXl:  { fontSize: 52, fontWeight: 900 },
} as const

export const spacing = {
  pageX: '1.5rem',
  pageY: '1.25rem',
  sectionGap: '1.5rem',
  panelPad: '1.25rem',
} as const
```

- [ ] **Run test to verify it passes**

```bash
cd frontend && npm run test -- lib/__tests__/tokens.test.ts
```
Expected: all 3 tests pass

- [ ] **Commit**

```bash
cd frontend && git add src/lib/tokens.ts src/lib/__tests__/tokens.test.ts
git commit -m "feat: add typography and spacing scale to tokens.ts"
```

---

### Task 2: Generic `buildRegimeBands` + `RegimeBands` component

**Files:**
- Modify: `frontend/src/lib/chartUtils.ts`
- Create: `frontend/src/components/charts/RegimeBands.tsx`
- Create: `frontend/src/lib/__tests__/chartUtils.test.ts`

- [ ] **Write the failing test**

```typescript
// frontend/src/lib/__tests__/chartUtils.test.ts
import { describe, it, expect } from 'vitest'
import { buildRegimeBands } from '../chartUtils'

const pt = (date: string, regime: string) => ({ date, regime, transition_risk: null, vix_level: null, close: null })

describe('buildRegimeBands', () => {
  it('returns [] for empty data', () => {
    expect(buildRegimeBands([], r => r.regime, r => r.date)).toEqual([])
  })

  it('returns one band for uniform regime', () => {
    const data = [pt('2020-01-01', 'calm'), pt('2020-01-02', 'calm')]
    expect(buildRegimeBands(data, r => r.regime, r => r.date)).toEqual([
      { start: '2020-01-01', end: '2020-01-02', regime: 'calm' },
    ])
  })

  it('splits on regime change', () => {
    const data = [pt('2020-01-01', 'calm'), pt('2020-01-02', 'elevated'), pt('2020-01-03', 'elevated')]
    const bands = buildRegimeBands(data, r => r.regime, r => r.date)
    expect(bands).toHaveLength(2)
    expect(bands[0]).toEqual({ start: '2020-01-01', end: '2020-01-02', regime: 'calm' })
    expect(bands[1]).toEqual({ start: '2020-01-02', end: '2020-01-03', regime: 'elevated' })
  })

  it('works with a custom regime getter (EventReplayPoint style)', () => {
    const data = [
      { date: '2020-01-01', regime_actual: 'calm' },
      { date: '2020-01-02', regime_actual: 'turbulent' },
    ]
    const bands = buildRegimeBands(data, r => r.regime_actual, r => r.date)
    expect(bands).toHaveLength(2)
    expect(bands[0].regime).toBe('calm')
    expect(bands[1].regime).toBe('turbulent')
  })
})
```

- [ ] **Run test to verify it fails**

```bash
cd frontend && npm run test -- lib/__tests__/chartUtils.test.ts
```
Expected: fails because `buildRegimeBands` doesn't accept `getRegime`/`getDate` arguments yet

- [ ] **Update `frontend/src/lib/chartUtils.ts`**

```typescript
// Replace the entire file
import type { HistoricalPoint } from '../types/api'

export function buildRegimeBands<T>(
  data: T[],
  getRegime: (pt: T) => string,
  getDate: (pt: T) => string,
): { start: string; end: string; regime: string }[] {
  const bands: { start: string; end: string; regime: string }[] = []
  let current: { start: string; regime: string } | null = null
  for (const pt of data) {
    const regime = getRegime(pt)
    if (!current || current.regime !== regime) {
      if (current) bands.push({ ...current, end: getDate(pt) })
      current = { start: getDate(pt), regime }
    }
  }
  if (current && data.length > 0) {
    bands.push({ ...current, end: getDate(data[data.length - 1]) })
  }
  return bands
}

// Convenience wrapper for HistoricalPoint (existing callers)
export function buildHistoricalBands(data: HistoricalPoint[]) {
  return buildRegimeBands(data, p => p.regime, p => p.date)
}
```

- [ ] **Create `frontend/src/components/charts/RegimeBands.tsx`**

```tsx
import { ReferenceArea } from 'recharts'
import { regimeGlow } from '../../lib/tokens'

interface Band { start: string; end: string; regime: string }

export default function RegimeBands({ bands }: { bands: Band[] }) {
  return (
    <>
      {bands.map((b, i) => (
        <ReferenceArea
          key={i}
          x1={b.start}
          x2={b.end}
          fill={regimeGlow[b.regime] ?? 'transparent'}
          strokeOpacity={0}
        />
      ))}
    </>
  )
}
```

- [ ] **Update callers** — change `buildRegimeBands(data)` → `buildHistoricalBands(data)` in:
  - `frontend/src/components/charts/RegimeChart.tsx` (import `buildHistoricalBands` instead of `buildRegimeBands`)
  - `frontend/src/components/charts/MiniRegimeChart.tsx` (same — the `buildCssGradient` function's input stays unchanged)

`EventReplayChart.tsx` will be updated in Task 13 to use the generic form.

- [ ] **Run all tests**

```bash
cd frontend && npm run test
```
Expected: all existing tests + new chartUtils tests pass

- [ ] **Commit**

```bash
git add frontend/src/lib/chartUtils.ts frontend/src/lib/__tests__/chartUtils.test.ts frontend/src/components/charts/RegimeBands.tsx frontend/src/components/charts/RegimeChart.tsx frontend/src/components/charts/MiniRegimeChart.tsx
git commit -m "feat: make buildRegimeBands generic; add RegimeBands component"
```

---

### Task 3: Upgrade `ChartTooltip` to multi-series + token colors

**Files:**
- Modify: `frontend/src/components/charts/ChartTooltip.tsx`

No new tests — existing tooltip behavior is covered by the charts rendering. Verify visually in Task 10.

- [ ] **Replace `frontend/src/components/charts/ChartTooltip.tsx`**

```tsx
import { colors } from '../../lib/tokens'

interface SeriesEntry {
  value?: number | string | null
  name?: string
  color?: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: SeriesEntry[]
  label?: string
  accentColor?: string
  formatter?: (value: number, name?: string) => string
  labelFormatter?: (label: string) => string
}

export default function ChartTooltip({
  active,
  payload,
  label,
  accentColor = colors.cyan,
  formatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const entries = payload.filter(e => e.value != null && typeof e.value === 'number')
  if (!entries.length) return null

  const displayLabel = labelFormatter ? labelFormatter(label ?? '') : (label ?? '')

  return (
    <div style={{
      background: colors.glass,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: `1px solid ${colors.cyanDim}`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 8,
      padding: '10px 14px',
      pointerEvents: 'none',
      minWidth: 120,
    }}>
      {displayLabel && (
        <div style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 6 }}>{displayLabel}</div>
      )}
      {entries.map((e, i) => {
        const val = e.value as number
        const display = formatter ? formatter(val, e.name) : val.toFixed(2)
        const dot = e.color ?? accentColor
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: i > 0 ? 4 : 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
            {e.name && <span style={{ fontSize: 11, color: colors.textMuted }}>{e.name}</span>}
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, marginLeft: 'auto' }}>{display}</span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Run all tests**

```bash
cd frontend && npm run test
```
Expected: pass (no logic tests for tooltip itself)

- [ ] **Commit**

```bash
git add frontend/src/components/charts/ChartTooltip.tsx
git commit -m "feat: upgrade ChartTooltip to multi-series + glass token styling"
```

---

### Task 4: Build `ChartShell`

**Files:**
- Create: `frontend/src/components/charts/ChartShell.tsx`

`ChartShell` is a presentational wrapper — logic lives in the children/parent. No unit test; verify visually in Task 10.

- [ ] **Create `frontend/src/components/charts/ChartShell.tsx`**

```tsx
import type { ReactNode, CSSProperties } from 'react'
import { colors } from '../../lib/tokens'

const HEIGHT = { compact: 160, standard: 240, tall: 320 } as const

export interface ChartShellProps {
  title?: string
  height?: keyof typeof HEIGHT
  regimeGlowColor?: string
  headerRight?: ReactNode
  style?: CSSProperties
  children: ReactNode
}

export default function ChartShell({
  title,
  height = 'standard',
  regimeGlowColor,
  headerRight,
  style,
  children,
}: ChartShellProps) {
  return (
    <div style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      position: 'relative',
      ...style,
    }}>
      {regimeGlowColor && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${regimeGlowColor}, transparent)`,
        }} />
      )}
      {(title || headerRight) && (
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px 8px',
          borderBottom: `1px solid ${colors.border}`,
        }}>
          {title && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: colors.textMuted }}>
              {title}
            </span>
          )}
          {headerRight && <div style={{ position: 'relative', zIndex: 1 }}>{headerRight}</div>}
        </div>
      )}
      <div style={{ height: HEIGHT[height], position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/charts/ChartShell.tsx
git commit -m "feat: add ChartShell wrapper component"
```

---

### Task 5: Build `ChartAnnotation`

**Files:**
- Create: `frontend/src/components/charts/ChartAnnotation.tsx`

`ChartAnnotation` renders inside a recharts chart as a custom `ReferenceLine` label.

- [ ] **Create `frontend/src/components/charts/ChartAnnotation.tsx`**

```tsx
import { ReferenceLine } from 'recharts'
import { colors } from '../../lib/tokens'

interface AnnotationLabelProps {
  viewBox?: { x?: number; y?: number; height?: number }
  label: string
  description?: string
  side?: 'left' | 'right'
}

function AnnotationLabel({ viewBox, label, description, side = 'right' }: AnnotationLabelProps) {
  const x = (viewBox?.x ?? 0) + (side === 'right' ? 8 : -8)
  const y = viewBox?.y ?? 0
  const anchor = side === 'right' ? 'start' : 'end'

  return (
    <g>
      <rect
        x={side === 'right' ? x : x - 110}
        y={y + 4}
        width={110}
        height={description ? 34 : 20}
        rx={4}
        fill="rgba(12,16,32,0.85)"
        stroke={colors.cyanDim}
      />
      <text x={x + (side === 'right' ? 6 : -6)} y={y + 15} fill={colors.textPrimary} fontSize={9} fontWeight={700} textAnchor={anchor}>
        {label}
      </text>
      {description && (
        <text x={x + (side === 'right' ? 6 : -6)} y={y + 28} fill={colors.textSecondary} fontSize={8} textAnchor={anchor}>
          {description}
        </text>
      )}
    </g>
  )
}

export interface AnnotationProps {
  x: string | number
  label: string
  description?: string
  side?: 'left' | 'right'
  color?: string
}

export default function ChartAnnotation({ x, label, description, side = 'right', color = colors.cyan }: AnnotationProps) {
  return (
    <ReferenceLine
      x={x}
      stroke={color}
      strokeDasharray="3 3"
      strokeOpacity={0.7}
      label={<AnnotationLabel label={label} description={description} side={side} />}
    />
  )
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/charts/ChartAnnotation.tsx
git commit -m "feat: add ChartAnnotation component for pinned chart markers"
```

---

### Task 6: Build `useScrubber` hook + `Scrubber` component

**Files:**
- Create: `frontend/src/hooks/useScrubber.ts`
- Create: `frontend/src/components/charts/Scrubber.tsx`
- Create: `frontend/src/hooks/__tests__/useScrubber.test.ts`

- [ ] **Write the failing test**

```typescript
// frontend/src/hooks/__tests__/useScrubber.test.ts
import { describe, it, expect } from 'vitest'

// Pure logic helpers extracted from useScrubber — test these directly
function clampFrame(frame: number, total: number): number {
  return Math.max(0, Math.min(frame, total - 1))
}

function isAtEnd(frame: number, total: number): boolean {
  return frame >= total - 1
}

describe('scrubber logic', () => {
  it('clamps frame to valid range', () => {
    expect(clampFrame(-1, 10)).toBe(0)
    expect(clampFrame(15, 10)).toBe(9)
    expect(clampFrame(5, 10)).toBe(5)
  })

  it('isAtEnd is true when frame is last', () => {
    expect(isAtEnd(9, 10)).toBe(true)
    expect(isAtEnd(8, 10)).toBe(false)
  })
})
```

- [ ] **Run test to verify it fails**

```bash
cd frontend && npm run test -- hooks/__tests__/useScrubber.test.ts
```
Expected: fails because module doesn't exist

- [ ] **Create `frontend/src/hooks/useScrubber.ts`**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react'

export function clampFrame(frame: number, total: number): number {
  return Math.max(0, Math.min(frame, total - 1))
}

export function isAtEnd(frame: number, total: number): boolean {
  return frame >= total - 1
}

interface UseScrubberOptions {
  totalFrames: number
  playbackMs?: number  // ms per frame, default 80
}

export function useScrubber({ totalFrames, playbackMs = 80 }: UseScrubberOptions) {
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    setPlaying(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [])

  const play = useCallback(() => {
    if (isAtEnd(frame, totalFrames)) setFrame(0)
    setPlaying(true)
  }, [frame, totalFrames])

  const seek = useCallback((f: number) => {
    stop()
    setFrame(clampFrame(f, totalFrames))
  }, [stop, totalFrames])

  useEffect(() => {
    if (!playing) return
    intervalRef.current = setInterval(() => {
      setFrame(prev => {
        const next = prev + 1
        if (next >= totalFrames) {
          stop()
          return totalFrames - 1
        }
        return next
      })
    }, playbackMs)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, totalFrames, playbackMs, stop])

  return { frame, playing, play, stop, seek }
}

export type UseScrubberReturn = ReturnType<typeof useScrubber>
```

- [ ] **Update the test** to import `clampFrame` and `isAtEnd` from the module:

```typescript
// frontend/src/hooks/__tests__/useScrubber.test.ts
import { describe, it, expect } from 'vitest'
import { clampFrame, isAtEnd } from '../useScrubber'

describe('scrubber logic', () => {
  it('clamps frame to valid range', () => {
    expect(clampFrame(-1, 10)).toBe(0)
    expect(clampFrame(15, 10)).toBe(9)
    expect(clampFrame(5, 10)).toBe(5)
  })

  it('isAtEnd is true when frame is last', () => {
    expect(isAtEnd(9, 10)).toBe(true)
    expect(isAtEnd(8, 10)).toBe(false)
  })
})
```

- [ ] **Create `frontend/src/components/charts/Scrubber.tsx`**

```tsx
import { colors } from '../../lib/tokens'
import type { UseScrubberReturn } from '../../hooks/useScrubber'

interface ScrubberProps {
  scrubber: UseScrubberReturn
  totalFrames: number
  frameLabel?: (frame: number) => string
}

export default function Scrubber({ scrubber, totalFrames, frameLabel }: ScrubberProps) {
  const { frame, playing, play, stop, seek } = scrubber
  const pct = totalFrames > 1 ? (frame / (totalFrames - 1)) * 100 : 0

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 16px',
      borderTop: `1px solid ${colors.border}`,
      background: colors.surface,
    }}>
      <button
        onClick={playing ? stop : play}
        style={{
          width: 28, height: 28, borderRadius: '50%',
          background: colors.cyan, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <span style={{ display: 'flex', gap: 3 }}>
            <span style={{ width: 3, height: 10, background: colors.bg, borderRadius: 1 }} />
            <span style={{ width: 3, height: 10, background: colors.bg, borderRadius: 1 }} />
          </span>
        ) : (
          <span style={{ borderLeft: `8px solid ${colors.bg}`, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', marginLeft: 2 }} />
        )}
      </button>

      <input
        type="range"
        min={0}
        max={totalFrames - 1}
        value={frame}
        onChange={e => seek(Number(e.target.value))}
        style={{ flex: 1, accentColor: colors.cyan, cursor: 'pointer' }}
        aria-label="Playhead"
      />

      {frameLabel && (
        <span style={{ fontSize: 11, color: colors.textSecondary, minWidth: 120, textAlign: 'right', flexShrink: 0 }}>
          {frameLabel(frame)}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Run all tests**

```bash
cd frontend && npm run test
```
Expected: all tests pass

- [ ] **Commit**

```bash
git add frontend/src/hooks/useScrubber.ts frontend/src/hooks/__tests__/useScrubber.test.ts frontend/src/components/charts/Scrubber.tsx
git commit -m "feat: add useScrubber hook and Scrubber transport component"
```

---

### Task 7: Build `SegmentedControl`

**Files:**
- Create: `frontend/src/components/ui/SegmentedControl.tsx`

- [ ] **Create `frontend/src/components/ui/SegmentedControl.tsx`**

```tsx
import { colors } from '../../lib/tokens'

interface Option {
  value: string
  label: string
}

interface SegmentedControlProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
}

export default function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div style={{
      display: 'inline-flex',
      background: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      padding: 2,
      gap: 2,
    }}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              background: active ? colors.surface : 'transparent',
              color: active ? colors.textPrimary : colors.textSecondary,
              boxShadow: active ? `0 0 0 1px ${colors.border}` : 'none',
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/ui/SegmentedControl.tsx
git commit -m "feat: add SegmentedControl component"
```

---

### Task 8: Delete inline tooltip copies from `RegimeChart` + `MiniRegimeChart`

**Files:**
- Modify: `frontend/src/components/charts/RegimeChart.tsx`
- Modify: `frontend/src/components/charts/MiniRegimeChart.tsx`

This is a refactor — confirm tests still pass after.

- [ ] **In `RegimeChart.tsx`**: remove the inline `Tooltip content` implementation; import and use `ChartTooltip` with multi-series support.

The current inline `<Tooltip content={...}>` in `RegimeChart` renders SPY + optionally VIX. After this task, replace with:

```tsx
import ChartTooltip from './ChartTooltip'
// ...
<Tooltip
  content={(props) => (
    <ChartTooltip
      active={props.active}
      payload={props.payload as Array<{ value?: number | string | null; name?: string; color?: string }>}
      label={props.label as string}
      formatter={(v, name) => name === 'vix' ? v.toFixed(1) : v.toFixed(0)}
      labelFormatter={l => l}
    />
  )}
/>
```

- [ ] **In `MiniRegimeChart.tsx`**: same pattern — remove the inline `MiniTooltip` function and use `ChartTooltip` instead.

- [ ] **Run all tests**

```bash
cd frontend && npm run test
```
Expected: all pass

- [ ] **Commit**

```bash
git add frontend/src/components/charts/RegimeChart.tsx frontend/src/components/charts/MiniRegimeChart.tsx
git commit -m "refactor: consolidate to single ChartTooltip; remove inline tooltip copies"
```

---

## Phase 2 — History Page

### Task 9: Date-range support in hook + API client

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/hooks/useHistoricalState.ts`

The backend `/historical-state` already accepts `start` and `end` params (`src/api/routes.py:99`). Only frontend changes needed.

- [ ] **Update `frontend/src/api/client.ts`** — change `historicalState`:

```typescript
historicalState: (start = '2020-01-01', end?: string) => {
  const params = new URLSearchParams({ start })
  if (end) params.set('end', end)
  return get<HistoricalStateResponse>(`/historical-state?${params}`)
},
```

- [ ] **Update `frontend/src/hooks/useHistoricalState.ts`**

```typescript
import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { HistoricalStateResponse } from '../types/api'

export function useHistoricalState(start = '2020-01-01', end?: string) {
  const [data, setData] = useState<HistoricalStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.historicalState(start, end)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [start, end])

  return { data, loading, error }
}
```

- [ ] **Run all tests**

```bash
cd frontend && npm run test
```
Expected: pass

- [ ] **Commit**

```bash
git add frontend/src/api/client.ts frontend/src/hooks/useHistoricalState.ts
git commit -m "feat: add end-date param to useHistoricalState + api.historicalState"
```

---

### Task 10: Rebuild History layout — linked chart stack + companion feed

**Files:**
- Modify: `frontend/src/pages/History.tsx`

Current: 3 stacked `Panel`s. Target: compact hero strip + linked `ChartShell` stack (left) + `ChangelogFeed` panel (right companion) on desktop; stacked on mobile.

- [ ] **Replace `frontend/src/pages/History.tsx`** with the new layout. Key structural changes:

```tsx
import { useState } from 'react'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import ChartShell from '../components/charts/ChartShell'
import RegimeChart from '../components/charts/RegimeChart'
import RiskLineChart from '../components/charts/RiskLineChart'
import ChangelogFeed from '../components/ui/ChangelogFeed'
import { useHistoricalState } from '../hooks/useHistoricalState'
import { useChangelog } from '../hooks/useChangelog'
import { regimeColor } from '../lib/tokens'

const DEFAULT_START = '2020-01-01'

export default function History() {
  const [start, setStart] = useState(DEFAULT_START)
  const [end, setEnd] = useState<string | undefined>(undefined)
  const [showVix, setShowVix] = useState(false)
  const [hoverX, setHoverX] = useState<string | null>(null)
  const [pinnedDate, setPinnedDate] = useState<string | null>(null)

  const { data, loading } = useHistoricalState(start, end)
  const { data: changelog, loading: clLoading } = useChangelog()

  const latestRegime = data?.data.at(-1)?.regime ?? 'unknown'
  const rColor = regimeColor[latestRegime] ?? regimeColor.unknown

  // DateRange header control
  const dateRangeControl = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={() => setShowVix(v => !v)}
        style={{
          fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid',
          borderColor: showVix ? rColor : '#243348',
          background: showVix ? `${rColor}18` : 'transparent',
          color: showVix ? rColor : '#64748b',
          cursor: 'pointer',
        }}
      >
        VIX
      </button>
      <input
        type="date"
        value={start}
        max={end ?? new Date().toISOString().slice(0, 10)}
        onChange={e => setStart(e.target.value)}
        style={{ fontSize: 11, background: '#0a0e1a', border: '1px solid #243348', borderRadius: 5, color: '#94a3b8', padding: '3px 6px' }}
      />
      <span style={{ fontSize: 11, color: '#4a6080' }}>→</span>
      <input
        type="date"
        value={end ?? ''}
        min={start}
        onChange={e => setEnd(e.target.value || undefined)}
        style={{ fontSize: 11, background: '#0a0e1a', border: '1px solid #243348', borderRadius: 5, color: '#94a3b8', padding: '3px 6px' }}
        placeholder="today"
      />
      {end && (
        <button onClick={() => setEnd(undefined)} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
      )}
    </div>
  )

  return (
    <div>
      <Topbar title="History" subtitle={loading ? 'Loading…' : `${data?.start ?? start} – ${data?.end ?? 'today'}`} />
      <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Two-column on desktop, stacked on mobile */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: '1.5rem', alignItems: 'start' }}
          className="lg:grid-cols-[1fr_300px] grid-cols-1">
          {/* Left: linked chart stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <ChartShell title="Regime & SPY" height="tall" headerRight={dateRangeControl} regimeGlowColor={`${rColor}18`}>
              <RegimeChart
                data={data?.data ?? []}
                showVix={showVix}
                syncHoverX={hoverX}
                onSyncHoverX={setHoverX}
                pinnedDate={pinnedDate}
              />
            </ChartShell>
            <ChartShell title="Transition Risk">
              <RiskLineChart
                data={data?.data ?? []}
                syncHoverX={hoverX}
                onSyncHoverX={setHoverX}
              />
            </ChartShell>
          </div>
          {/* Right: feed */}
          <Panel title="Notable Days">
            <ChangelogFeed
              entries={changelog?.entries ?? []}
              loading={clLoading}
              highlightDate={pinnedDate}
              onEntryClick={date => setPinnedDate(d => d === date ? null : date)}
            />
          </Panel>
        </div>
      </div>
    </div>
  )
}
```

Note: `RegimeChart` and `RiskLineChart` need new `syncHoverX`/`onSyncHoverX` props (Task 11) and `RegimeChart` needs a `pinnedDate` prop (Task 12). Add them incrementally — add the props with optional typing now so the component compiles, implement behavior in the next tasks.

- [ ] **Add optional sync props to `RegimeChart` and `RiskLineChart`** — add `syncHoverX?: string | null` and `onSyncHoverX?: (x: string | null) => void` to their prop interfaces. Implement the sync crosshair behavior in Task 11.

- [ ] **Verify build compiles**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: no TypeScript errors

- [ ] **Commit**

```bash
git add frontend/src/pages/History.tsx frontend/src/components/charts/RegimeChart.tsx frontend/src/components/charts/RiskLineChart.tsx
git commit -m "feat(history): linked chart stack + companion feed column layout"
```

---

### Task 11: Synced crosshair + brush-to-zoom on History

**Files:**
- Modify: `frontend/src/components/charts/RegimeChart.tsx`
- Modify: `frontend/src/components/charts/RiskLineChart.tsx`

- [ ] **Implement synced crosshair in `RegimeChart.tsx`**

Add `onMouseMove` and `onMouseLeave` to `<ComposedChart>` to report hover X to the parent:

```tsx
// At the top of RegimeChart, destructure new props:
interface RegimeChartProps {
  data: HistoricalPoint[]
  showVix: boolean
  syncHoverX?: string | null
  onSyncHoverX?: (x: string | null) => void
  pinnedDate?: string | null
}

// Inside the JSX, on <ComposedChart>:
<ComposedChart
  data={data}
  margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
  onMouseMove={(e) => {
    const date = e?.activeLabel as string | undefined
    if (date) onSyncHoverX?.(date)
  }}
  onMouseLeave={() => onSyncHoverX?.(null)}
>
```

To render the external crosshair from `syncHoverX`, add a `<ReferenceLine>` when `syncHoverX` is set from the parent (not from local hover — recharts handles local hover via `Tooltip`):

```tsx
{syncHoverX && (
  <ReferenceLine
    x={syncHoverX}
    stroke={colors.textSecondary}
    strokeDasharray="3 3"
    strokeOpacity={0.5}
  />
)}
```

Add `<Brush>` for zoom at the bottom of the chart:

```tsx
import { Brush } from 'recharts'
// Inside ComposedChart, after the series:
<Brush
  dataKey="date"
  height={20}
  stroke={colors.border}
  fill={colors.surfaceElevated}
  travellerWidth={6}
  startIndex={0}
  endIndex={data.length - 1}
>
  <span /> {/* Brush requires a child */}
</Brush>
```

- [ ] **Apply the same crosshair pattern to `RiskLineChart.tsx`** — add `syncHoverX`/`onSyncHoverX` props, add `onMouseMove`/`onMouseLeave`, add `<ReferenceLine x={syncHoverX}>`.

- [ ] **Run all tests**

```bash
cd frontend && npm run test
```
Expected: pass

- [ ] **Commit**

```bash
git add frontend/src/components/charts/RegimeChart.tsx frontend/src/components/charts/RiskLineChart.tsx
git commit -m "feat(history): synced crosshair + brush-to-zoom on History charts"
```

---

### Task 12: `ChangelogFeed` → chart annotation linking

**Files:**
- Modify: `frontend/src/components/ui/ChangelogFeed.tsx`
- Modify: `frontend/src/components/charts/RegimeChart.tsx`

- [ ] **Add `onEntryClick` + `highlightDate` props to `ChangelogFeed.tsx`**

```tsx
interface ChangelogFeedProps {
  entries: ChangelogEntry[]
  loading?: boolean
  highlightDate?: string | null
  onEntryClick?: (date: string) => void
}
```

Each entry row gets `onClick={() => onEntryClick?.(entry.date)}` and a visual highlight when `entry.date === highlightDate`.

- [ ] **Add `pinnedDate` annotation to `RegimeChart.tsx`**

When `pinnedDate` is set, render a `ChartAnnotation` at that date:

```tsx
import ChartAnnotation from './ChartAnnotation'
// Inside ComposedChart, before closing tag:
{pinnedDate && (
  <ChartAnnotation
    x={pinnedDate}
    label={pinnedDate}
    description="Notable day"
    side="right"
    color={colors.cyan}
  />
)}
```

In practice, pass the changelog entry's label through from History.tsx (enrich `pinnedDate` to include the entry label). For now, showing the date is sufficient.

- [ ] **Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

- [ ] **Commit**

```bash
git add frontend/src/components/ui/ChangelogFeed.tsx frontend/src/components/charts/RegimeChart.tsx
git commit -m "feat(history): changelog entry click pins chart annotation"
```

---

## Phase 3 — Event Replay Page

### Task 13: Rebuild `EventReplayChart` on `ChartShell` + `RegimeBands`

**Files:**
- Modify: `frontend/src/components/charts/EventReplayChart.tsx`

- [ ] **Rewrite `EventReplayChart.tsx`** to:
  1. Use the generic `buildRegimeBands` (replace local `buildBands`)
  2. Add a `playheadDate` prop for the animated playhead line
  3. Promote `✕` markers to `ChartAnnotation`s
  4. Wrap in `ChartShell`

```tsx
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { EventReplayPoint } from '../../types/api'
import { DEFAULT_THRESHOLD } from '../../lib/constants'
import ChartTooltip from './ChartTooltip'
import RegimeBands from './RegimeBands'
import ChartAnnotation from './ChartAnnotation'
import { buildRegimeBands } from '../../lib/chartUtils'
import { colors } from '../../lib/tokens'

interface EventReplayChartProps {
  data: EventReplayPoint[]
  playheadDate?: string
  visibleUpTo?: string  // progressive reveal
}

export default function EventReplayChart({ data, playheadDate, visibleUpTo }: EventReplayChartProps) {
  const bands = buildRegimeBands(data, p => p.regime_actual, p => p.date)
  const firstCrossDate = data.find(p => (p.transition_risk ?? 0) > DEFAULT_THRESHOLD)?.date
  const transitions = data.filter(p => p.transition_actual)

  // Progressive reveal: dim data points after visibleUpTo
  const displayData = visibleUpTo
    ? data.map(p => p.date <= visibleUpTo ? p : { ...p, transition_risk: null })
    : data

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={displayData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <RegimeBands bands={bands} />
        <XAxis dataKey="date" tick={{ fill: colors.textDim, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          tick={{ fill: colors.textDim, fontSize: 10 }}
          tickLine={false} axisLine={false} domain={[0, 1]} width={40}
        />
        <Tooltip
          content={(props) => (
            <ChartTooltip
              active={props.active}
              payload={props.payload as Array<{ value?: number | string | null; name?: string }>}
              label={props.label as string}
              accentColor={colors.cyan}
              formatter={(v) => `${(v * 100).toFixed(1)}%`}
            />
          )}
        />
        <Line
          type="monotone"
          dataKey="transition_risk"
          stroke={colors.cyan}
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          animationDuration={400}
        />
        {firstCrossDate && (
          <ChartAnnotation x={firstCrossDate} label="Alert threshold crossed" side="right" color={colors.amber} />
        )}
        {transitions.slice(0, 3).map((t, i) => (
          <ChartAnnotation key={i} x={t.date} label="Regime change" side="left" color={colors.red} />
        ))}
        {playheadDate && (
          <ReferenceLine x={playheadDate} stroke={colors.textPrimary} strokeWidth={1.5} strokeDasharray="none" />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Run all tests**

```bash
cd frontend && npm run test
```

- [ ] **Commit**

```bash
git add frontend/src/components/charts/EventReplayChart.tsx
git commit -m "feat(event-replay): rebuild chart with RegimeBands, ChartAnnotation, playhead"
```

---

### Task 14: Add `Scrubber` to Event Replay + progressive chart reveal

**Files:**
- Modify: `frontend/src/pages/EventReplay.tsx`

- [ ] **Rewrite `frontend/src/pages/EventReplay.tsx`** layout + scrubber integration:

```tsx
import { useState } from 'react'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import MetricCard from '../components/ui/MetricCard'
import ChartShell from '../components/charts/ChartShell'
import EventReplayChart from '../components/charts/EventReplayChart'
import Scrubber from '../components/charts/Scrubber'
import SegmentedControl from '../components/ui/SegmentedControl'
import { useScrubber } from '../hooks/useScrubber'
import { useEventReplay } from '../hooks/useEventReplay'
import { colors } from '../lib/tokens'
import { EVENT_CONTENT, EVENTS } from '../lib/eventContent'  // move hardcoded content here

export default function EventReplay() {
  const [selectedEvent, setSelectedEvent] = useState(EVENTS[0].value)
  const { data, loading } = useEventReplay(selectedEvent)

  const totalFrames = data?.data.length ?? 0
  const scrubber = useScrubber({ totalFrames, playbackMs: 80 })
  const { frame } = scrubber

  const currentPoint = data?.data[frame]
  const frameLabel = (f: number) => {
    const pt = data?.data[f]
    if (!pt) return ''
    const risk = pt.transition_risk != null ? `${(pt.transition_risk * 100).toFixed(1)}%` : '—'
    return `${pt.date} · risk ${risk}`
  }

  // Stats computed at playhead
  const peakSoFar = data?.data.slice(0, frame + 1).reduce((m, p) => Math.max(m, p.transition_risk ?? 0), 0) ?? 0
  const alertDaysSoFar = data?.data.slice(0, frame + 1).filter(p => (p.transition_risk ?? 0) > 0.3).length ?? 0

  const content = EVENT_CONTENT[selectedEvent]

  return (
    <div>
      <Topbar title="Event Replay" />
      <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <SegmentedControl
          options={EVENTS}
          value={selectedEvent}
          onChange={(v) => { setSelectedEvent(v); scrubber.seek(0) }}
        />

        {/* Stat cards — live at playhead */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <MetricCard label="Days into event" value={String(frame + 1)} />
          <MetricCard label="Risk today" value={currentPoint?.transition_risk != null ? `${(currentPoint.transition_risk * 100).toFixed(1)}%` : '—'} />
          <MetricCard label="Peak risk so far" value={`${(peakSoFar * 100).toFixed(1)}%`} />
          <MetricCard label="Alert days so far" value={String(alertDaysSoFar)} />
        </div>

        {/* Replay chart + scrubber */}
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px 8px', borderBottom: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: colors.textMuted }}>
              Transition Risk & Regime
            </span>
          </div>
          <div style={{ height: 300 }}>
            <EventReplayChart
              data={data?.data ?? []}
              playheadDate={currentPoint?.date}
              visibleUpTo={currentPoint?.date}
            />
          </div>
          <Scrubber scrubber={scrubber} totalFrames={totalFrames} frameLabel={frameLabel} />
        </div>

        {/* Narrative */}
        {content && (
          <Panel title="What happened">
            <p style={{ fontSize: 13, color: colors.textSecondary, margin: 0, lineHeight: 1.7 }}>{content.description}</p>
          </Panel>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Create `frontend/src/lib/eventContent.ts`** — move `EVENTS` array and `EVENT_CONTENT` out of the page:

```typescript
export const EVENTS = [
  { value: '2008-gfc', label: '2008 GFC' },
  { value: 'covid-2020', label: 'COVID 2020' },
  { value: '2022-tightening', label: '2022 Tightening' },
] as const

export const EVENT_CONTENT: Record<string, { description: string; takeaway: string }> = {
  '2008-gfc': {
    description: 'The 2008 Global Financial Crisis...',  // copy from existing EventReplay.tsx EVENT_CONTENT
    takeaway: '...',
  },
  'covid-2020': { description: '...', takeaway: '...' },
  '2022-tightening': { description: '...', takeaway: '...' },
}
```

Copy the actual content strings from the existing `EventReplay.tsx` `EVENT_CONTENT` object.

- [ ] **Run all tests**

```bash
cd frontend && npm run test
```

- [ ] **Commit**

```bash
git add frontend/src/pages/EventReplay.tsx frontend/src/lib/eventContent.ts
git commit -m "feat(event-replay): real scrubber, progressive reveal, live stat cards"
```

---

### Task 15: Fix Event Replay stat grid responsiveness

**Files:**
- Modify: `frontend/src/pages/EventReplay.tsx`

The 4-col stat grid from Task 14 needs to collapse on mobile.

- [ ] **Make stat grid responsive** by replacing the inline `gridTemplateColumns: 'repeat(4, 1fr)'` with a Tailwind class that stacks on mobile:

```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
  {/* MetricCard items */}
</div>
```

Remove the inline `gridTemplateColumns` style from that div.

- [ ] **Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

- [ ] **Commit**

```bash
git add frontend/src/pages/EventReplay.tsx
git commit -m "fix(event-replay): responsive stat card grid (2 cols mobile, 4 desktop)"
```

---

## Phase 4 — Signal Breakdown Page

### Task 16: Migrate `ModelDrivers.tsx` to tokens + reconcile `AnalogCard` palette

**Files:**
- Modify: `frontend/src/pages/ModelDrivers.tsx`
- Modify: `frontend/src/components/AnalogCard.tsx`
- Modify: `frontend/src/components/ClosestHistoricalSetups.tsx`

This is the largest single refactor. Work through it section by section.

- [ ] **Replace inline hex in `ModelDrivers.tsx` hero section** — the inline `display:flex; gap:20` hero block currently uses hardcoded `background`, `borderLeft`, etc. Replace with the same Tier-1 glass pattern from `CurrentState.tsx`:

```tsx
// Hero card — same pattern as CurrentState.tsx hero
<div style={{
  background: colors.glass,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: `1px solid ${regimeBorder(rColor)}`,
  borderRadius: 12,
  boxShadow: `${colors.glassHighlight}, 0 4px 32px rgba(0,0,0,0.5)`,
  padding: '20px 24px',
  position: 'relative',
  overflow: 'hidden',
  marginBottom: 0,
}}>
  {/* ambient glow */}
  <div style={{
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: `radial-gradient(ellipse 60% 60% at 80% 50%, ${regimeGlow[latestRegime]}, transparent)`,
  }} />
  {/* hero content */}
  <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
    <div style={{ flex: 1 }}>
      {/* date, headline, narrative bullets */}
    </div>
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      <div style={{ ...typography.statXl }}>{riskPct}%</div>
      <div style={{ ...typography.microLabel, marginTop: 4 }}>5-day transition risk</div>
      {/* regime badge */}
    </div>
  </div>
</div>
```

- [ ] **Replace all remaining hardcoded hex in `ModelDrivers.tsx`** — search for `#0[0-9a-f]` patterns in the file and replace with the appropriate `colors.*` token. Key replacements: `#94a3b8` → `colors.textSecondary`, `#64748b` → `colors.textMuted`, `#f1f5f9` → `colors.textPrimary`, `#0c1020` → `colors.surface`, `#151d2e` → `colors.border`.

- [ ] **Fix driver section Panel wrappers** — the two-column `Pushing higher` / `Holding in check` section and the forward section should be `<Panel>` components instead of inline-styled divs.

- [ ] **Reconcile `AnalogCard.tsx`** — replace `bg-white/[0.03]` and `border-white/10` with token equivalents:

```tsx
// In AnalogCard.tsx, change:
className="rounded-xl border border-white/10 bg-white/[0.03]"
// to:
style={{ borderRadius: 12, border: `1px solid ${colors.border}`, background: colors.surfaceElevated }}
```

Remove Tailwind opacity utilities; use token styles throughout `AnalogCard.tsx`.

- [ ] **Same reconciliation in `ClosestHistoricalSetups.tsx`** if any Tailwind opacity utilities remain there.

- [ ] **Run all tests**

```bash
cd frontend && npm run test
```

- [ ] **Commit**

```bash
git add frontend/src/pages/ModelDrivers.tsx frontend/src/components/AnalogCard.tsx frontend/src/components/ClosestHistoricalSetups.tsx
git commit -m "refactor(signal-breakdown): migrate to tokens/Panel; reconcile AnalogCard palette"
```

---

### Task 17: Extract `ReliabilityTable`

**Files:**
- Create: `frontend/src/components/ui/ReliabilityTable.tsx`
- Modify: `frontend/src/pages/ModelDrivers.tsx`

- [ ] **Create `frontend/src/components/ui/ReliabilityTable.tsx`**

Move the `<table>` definition currently at the bottom of `ModelDrivers.tsx` into this file. The component receives `bins: ThresholdSweepRow[]` as props:

```tsx
import type { ThresholdSweepRow } from '../../types/api'
import { colors } from '../../lib/tokens'

export default function ReliabilityTable({ rows }: { rows: ThresholdSweepRow[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          {['Threshold', 'Recall', 'False Alarm', 'Avg Lead'].map(h => (
            <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: colors.textMuted, fontWeight: 600 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${colors.borderSubtle}` }}>
            <td style={{ padding: '5px 8px', color: colors.textSecondary }}>{(row.threshold * 100).toFixed(0)}%</td>
            <td style={{ padding: '5px 8px', color: colors.green }}>{(row.recall * 100).toFixed(0)}%</td>
            <td style={{ padding: '5px 8px', color: colors.red }}>{(row.false_alert_rate * 100).toFixed(0)}%</td>
            <td style={{ padding: '5px 8px', color: colors.textSecondary }}>{row.avg_lead_time_days.toFixed(0)}d</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **In `ModelDrivers.tsx`**: remove the inline table definition; import and use `<ReliabilityTable rows={thresholdData} />`.

- [ ] **Run tests**

```bash
cd frontend && npm run test
```

- [ ] **Commit**

```bash
git add frontend/src/components/ui/ReliabilityTable.tsx frontend/src/pages/ModelDrivers.tsx
git commit -m "refactor(signal-breakdown): extract ReliabilityTable component"
```

---

### Task 18: Contribution chart (diverging bars with readability guardrail)

**Files:**
- Create: `frontend/src/components/charts/ContributionChart.tsx`
- Modify: `frontend/src/pages/ModelDrivers.tsx`

**Readability guardrail:** Build the diverging chart. Once real driver data renders, check: can a user immediately tell which side raises risk and which holds it in check, without needing to read a legend? If not, switch to the upgraded `DriverBar` layout (same `ChartShell` wrapper, same tokens, same `ChartAnnotation`-style hover, but horizontal bars instead of diverging). Make this call during implementation.

- [ ] **Create `frontend/src/components/charts/ContributionChart.tsx`** — a horizontal recharts `BarChart` around a center axis:

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell, ResponsiveContainer } from 'recharts'
import ChartTooltip from './ChartTooltip'
import { colors } from '../../lib/tokens'

interface ContributionRow {
  label: string
  value: number  // positive = raises risk, negative = holds in check
}

interface ContributionChartProps {
  data: ContributionRow[]
  onHover?: (label: string | null) => void
}

export default function ContributionChart({ data, onHover }: ContributionChartProps) {
  // Sort by absolute value so the strongest drivers are at top
  const sorted = [...data].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8)

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, sorted.length * 32)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 0 }}>
        <XAxis type="number" domain={['auto', 'auto']} tick={{ fill: colors.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" tick={{ fill: colors.textSecondary, fontSize: 11 }} axisLine={false} tickLine={false} width={140} />
        <ReferenceLine x={0} stroke={colors.border} strokeWidth={1.5} />
        <Tooltip
          content={(props) => (
            <ChartTooltip
              active={props.active}
              payload={props.payload as Array<{ value?: number | string | null; name?: string }>}
              label={props.label as string}
              formatter={(v) => v > 0 ? `+${v.toFixed(3)} (raises risk)` : `${v.toFixed(3)} (holds in check)`}
            />
          )}
        />
        <Bar
          dataKey="value"
          radius={[0, 3, 3, 0]}
          onMouseEnter={(entry) => onHover?.(entry.label as string)}
          onMouseLeave={() => onHover?.(null)}
        >
          {sorted.map((entry, i) => (
            <Cell key={i} fill={entry.value >= 0 ? colors.red : colors.green} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **In `ModelDrivers.tsx`**: add the `ContributionChart` using `local_explanation` data (convert the `Record<string, number>` from the API into `ContributionRow[]`). Place it inside a `ChartShell` with `title="What's driving the signal"`. Keep existing `DriverBar` importance list alongside it.

```tsx
// Build contribution rows from local_explanation
const contributionData = Object.entries(drivers.local_explanation)
  .map(([feature, value]) => ({
    label: featureLabels[feature] ?? feature,
    value,
  }))
```

- [ ] **Visually verify** at `npm run dev` → `/model-drivers`: does the diverging chart immediately communicate "red = raises, green = holds"? If it reads clearly, keep it. If not, replace `ContributionChart` with upgraded `DriverBar`s inside a `ChartShell`.

- [ ] **Run tests**

```bash
cd frontend && npm run test
```

- [ ] **Commit**

```bash
git add frontend/src/components/charts/ContributionChart.tsx frontend/src/pages/ModelDrivers.tsx
git commit -m "feat(signal-breakdown): contribution chart for push/pull driver story"
```

---

### Task 19: Hover-to-focus on driver bars

**Files:**
- Modify: `frontend/src/components/ui/DriverBar.tsx`
- Modify: `frontend/src/pages/ModelDrivers.tsx`

- [ ] **Add `focused` + `dimmed` props to `DriverBar.tsx`**

```tsx
interface DriverBarProps {
  label: string
  value: number
  maxValue: number
  delay?: number
  focused?: boolean
  dimmed?: boolean
}

// In the bar container div:
style={{
  opacity: dimmed ? 0.35 : 1,
  transition: 'opacity 0.2s',
  // ... existing styles
}}
```

- [ ] **Wire hover state in `ModelDrivers.tsx`** — add `focusedDriver` state, pass `focused`/`dimmed` props to each `DriverBar`:

```tsx
const [focusedDriver, setFocusedDriver] = useState<string | null>(null)

// For each DriverBar in the importance list:
<DriverBar
  key={item.feature}
  label={item.label}
  value={item.importance}
  maxValue={maxImportance}
  focused={focusedDriver === item.feature}
  dimmed={focusedDriver !== null && focusedDriver !== item.feature}
  onMouseEnter={() => setFocusedDriver(item.feature)}
  onMouseLeave={() => setFocusedDriver(null)}
/>
```

- [ ] **Run tests**

```bash
cd frontend && npm run test
```

- [ ] **Commit**

```bash
git add frontend/src/components/ui/DriverBar.tsx frontend/src/pages/ModelDrivers.tsx
git commit -m "feat(signal-breakdown): hover-to-focus dims unfocused driver bars"
```

---

## Phase 5 — Scenario Explorer

### Task 20: Build `ScenarioSlider`

**Files:**
- Create: `frontend/src/components/ui/ScenarioSlider.tsx`
- Create: `frontend/src/lib/__tests__/scenarioSlider.test.ts`

- [ ] **Write the failing test** (tests the value formatting utility, not rendering)

```typescript
// frontend/src/lib/__tests__/scenarioSlider.test.ts
import { describe, it, expect } from 'vitest'

function formatSliderValue(value: number, decimals: number): string {
  return value.toFixed(decimals)
}

describe('formatSliderValue', () => {
  it('formats to correct decimal places', () => {
    expect(formatSliderValue(0.123, 2)).toBe('0.12')
    expect(formatSliderValue(25.5, 1)).toBe('25.5')
    expect(formatSliderValue(100, 0)).toBe('100')
  })
})
```

- [ ] **Run test to verify it fails**

```bash
cd frontend && npm run test -- lib/__tests__/scenarioSlider.test.ts
```

- [ ] **Create `frontend/src/components/ui/ScenarioSlider.tsx`** and export `formatSliderValue`:

```tsx
import { colors } from '../../lib/tokens'

export function formatSliderValue(value: number, decimals: number): string {
  return value.toFixed(decimals)
}

const SENSITIVITY_COLOR = {
  low: colors.green,
  medium: colors.amber,
  high: colors.red,
}

interface ScenarioSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  sensitivityLevel?: 'low' | 'medium' | 'high'
  decimals?: number
  onChange: (value: number) => void
}

export default function ScenarioSlider({
  label, value, min, max, step,
  sensitivityLevel = 'low',
  decimals = 1,
  onChange,
}: ScenarioSliderProps) {
  const dotColor = SENSITIVITY_COLOR[sensitivityLevel]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: colors.textSecondary }}>{label}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: colors.textPrimary, minWidth: 36, textAlign: 'right' }}>
          {formatSliderValue(value, decimals)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: colors.cyan, height: 4, cursor: 'pointer' }}
      />
    </div>
  )
}
```

- [ ] **Update the test** to import from the module:

```typescript
import { formatSliderValue } from '../../components/ui/ScenarioSlider'
```

- [ ] **Run all tests**

```bash
cd frontend && npm run test
```

- [ ] **Commit**

```bash
git add frontend/src/components/ui/ScenarioSlider.tsx frontend/src/lib/__tests__/scenarioSlider.test.ts
git commit -m "feat: add ScenarioSlider component with sensitivity dot"
```

---

### Task 21: Restructure ScenarioExplorer layout

**Files:**
- Modify: `frontend/src/pages/ScenarioExplorer.tsx`

Replace the current `flex flex-col lg:flex-row` with the balanced split layout: controls left (38%), sticky result right (62%), mobile stack (controls → output).

- [ ] **Replace the outer container in `ScenarioExplorer.tsx`**

Current structure (`ScenarioExplorer.tsx:235-238`):
```tsx
<div className="px-6 py-5 flex flex-col lg:flex-row gap-5">
  <div className="w-full lg:w-[276px] shrink-0 space-y-4">  {/* left */}
  <div className="flex-1 min-w-0 space-y-4">  {/* right */}
```

Replace with:
```tsx
<div style={{ padding: '1.25rem 1.5rem' }}>
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 38fr) minmax(0, 62fr)',
    gap: '1.25rem',
    alignItems: 'start',
  }} className="lg:grid-cols-[38fr_62fr] grid-cols-1">

    {/* Left — controls */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* preset section, sliders, threshold — will be wired in Task 22 */}
    </div>

    {/* Right — sticky result */}
    <div style={{
      position: 'sticky',
      top: '1.25rem',
      maxHeight: 'calc(100vh - 5rem)',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      transform: 'translateZ(0)',  // prevent repaint jank
    }}>
      {/* verdict + tripod + driver cards — unchanged content */}
    </div>

  </div>
</div>
```

Preserve all existing content inside each column — only the container structure changes.

- [ ] **Verify no layout shift** — run `npm run dev`, open the Scenario Explorer, adjust a slider; confirm the right column doesn't jump. If it does, add `minHeight` to the right column matching the expected content height.

- [ ] **Verify mobile stack** — open browser at <768px width; confirm controls appear above output.

- [ ] **Run tests**

```bash
cd frontend && npm run test
```

- [ ] **Commit**

```bash
git add frontend/src/pages/ScenarioExplorer.tsx
git commit -m "feat(scenario): balanced split layout — 38/62, sticky output, mobile stack"
```

---

### Task 22: Replace sliders + add collapsible control sections

**Files:**
- Modify: `frontend/src/pages/ScenarioExplorer.tsx`

- [ ] **Replace bare `<input type=range>` sliders** with `ScenarioSlider` components. For each of the 6 factor sliders, import `ScenarioSlider` and swap:

```tsx
// Before (example):
<input
  type="range"
  min={config.min}
  max={config.max}
  step={config.step}
  value={inputs[config.key]}
  onChange={e => updateInput(config.key, Number(e.target.value))}
  style={{ accentColor: colors.cyan }}
/>

// After:
<ScenarioSlider
  label={config.label}
  value={inputs[config.key]}
  min={config.min}
  max={config.max}
  step={config.step}
  sensitivityLevel={config.sensitivity}  // 'low' | 'medium' | 'high' from sliderConfig.ts
  decimals={config.decimals ?? 1}
  onChange={v => updateInput(config.key, v)}
/>
```

Check `frontend/src/lib/sliderConfig.ts` for the exact `SliderConfig` field names — add a `sensitivity: 'low' | 'medium' | 'high'` field there if it doesn't already map to sensitivity level.

- [ ] **Add collapsible control sections** using framer-motion `AnimatePresence`. Create three sections: Presets, Drivers (open by default), Threshold (closed by default):

```tsx
import { AnimatePresence, motion } from 'framer-motion'

const [openSection, setOpenSection] = useState<'presets' | 'drivers' | 'threshold'>('drivers')

function SectionHeader({ id, label, summary }: { id: typeof openSection, label: string, summary?: string }) {
  const open = openSection === id
  return (
    <button
      onClick={() => setOpenSection(id)}
      style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 0', background: 'none', border: 'none', borderBottom: `1px solid ${colors.border}`,
        cursor: 'pointer', color: colors.textSecondary, fontSize: 11,
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      {summary && !open && <span style={{ color: colors.textMuted, fontSize: 10 }}>{summary}</span>}
      <span style={{ color: colors.textMuted }}>{open ? '▲' : '▼'}</span>
    </button>
  )
}

// Usage:
<SectionHeader id="drivers" label="Drivers" />
<AnimatePresence initial={false}>
  {openSection === 'drivers' && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ overflow: 'hidden' }}
    >
      {/* ScenarioSlider rows */}
    </motion.div>
  )}
</AnimatePresence>
```

- [ ] **Run all tests**

```bash
cd frontend && npm run test
```

- [ ] **Commit**

```bash
git add frontend/src/pages/ScenarioExplorer.tsx frontend/src/lib/sliderConfig.ts
git commit -m "feat(scenario): ScenarioSlider + collapsible control sections"
```

---

### Task 23: Enlarge `ProbabilityTripod` + 2-col driver card grid

**Files:**
- Modify: `frontend/src/components/charts/ProbabilityTripod.tsx`
- Modify: `frontend/src/pages/ScenarioExplorer.tsx`

- [ ] **Enlarge `ProbabilityTripod`** — in `ProbabilityTripod.tsx`, increase the dominant-tile numeric from current size to `typography.statXl` (52px/900) and the others to `typography.statLg` (40px/900):

```tsx
import { typography } from '../../lib/tokens'

// In the tile render, for dominant tile:
<AnimatedNumber value={prob} style={isDominant ? typography.statXl : typography.statLg} />

// Increase the dominant-tile glow opacity from current (check file) to a stronger value:
// If currently: boxShadow: `0 0 20px ${gColor}30`
// Change to:    boxShadow: `0 0 28px ${gColor}50, 0 0 0 1px ${gColor}26`
```

- [ ] **Make driver cards 2-col grid** in `ScenarioExplorer.tsx` — find the driver cards section in the right column and change from single-column to:

```tsx
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
  {/* existing driver card components */}
</div>
```

If the cards have explicit widths set, remove them so they fill the grid cells.

- [ ] **Run all tests**

```bash
cd frontend && npm run test
```

- [ ] **Verify visually** at `npm run dev` → `/scenario`: confirm tripod is larger, driver cards are 2-col, left column and right column are approximately equal height.

- [ ] **Commit**

```bash
git add frontend/src/components/charts/ProbabilityTripod.tsx frontend/src/pages/ScenarioExplorer.tsx
git commit -m "feat(scenario): enlarge ProbabilityTripod + 2-col driver card grid"
```

---

## Final verification

- [ ] **Full test suite**

```bash
cd frontend && npm run test
```
Expected: all tests pass (existing 118+ plus new tests)

- [ ] **TypeScript build clean**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|warning" | grep -v "warn" | head -10
```
Expected: no errors

- [ ] **Token adoption check** — no chart file should hardcode the core brand colors:

```bash
cd frontend && grep -rn '#06b6d4\|#4ade80\|#fbbf24\|#f87171\|#94a3b8\|#64748b\|#f1f5f9' src/components/charts/ src/pages/
```
Expected: zero matches (all replaced with `colors.*`)

- [ ] **Single tooltip check**

```bash
cd frontend && grep -rn "background.*rgba.*8,11,24\|background.*8,11,24" src/components/charts/
```
Expected: zero matches (old tooltip background gone from all chart files)

- [ ] **Playwright smoke test** — start the dev server, then run:

```bash
cd frontend && npm run test:smoke
```
Expected: smoke tests pass on all pages

- [ ] **Manual walkthrough** (desktop 1280px, tablet 900px, mobile 375px):
  - History: sync crosshair moves on both charts simultaneously; brush zooms; clicking a feed entry pins an annotation
  - Event Replay: play button animates risk day-by-day; scrubber is draggable; stat cards update
  - Signal Breakdown: single token palette throughout; diverging chart or DriverBars animate; hover dims siblings
  - Scenario Explorer: dragging a slider does not cause layout shift; result column is sticky; mobile stack order correct (controls → output)
