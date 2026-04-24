# Recent Context Card + History Regime Legend Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact 30-day SPY mini-chart to the Current State page and a regime color legend to the History page's main chart.

**Architecture:** Two new focused components (`MiniRegimeChart`, `RegimeLegend`) plus a shared `chartUtils.ts` utility. Minimal changes to two existing pages. No new API endpoints — `MiniRegimeChart` reuses `useHistoricalState` with a computed 30-days-ago start date. Tests use the existing Playwright smoke suite.

**Tech Stack:** React, TypeScript, Recharts (already in use), Playwright (smoke tests at `frontend/tests/smoke/smoke.spec.ts`)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/lib/chartUtils.ts` | **Create** | Shared `buildRegimeBands` utility used by both `RegimeChart` and `MiniRegimeChart` |
| `frontend/src/components/charts/RegimeChart.tsx` | **Modify** | Import `buildRegimeBands` from `chartUtils` instead of defining it locally |
| `frontend/src/components/charts/MiniRegimeChart.tsx` | **Create** | 120px SPY line + regime shading + today marker, no axes, no tooltip |
| `frontend/src/components/ui/RegimeLegend.tsx` | **Create** | Three inline color chips: Calm / Elevated / Turbulent |
| `frontend/src/pages/CurrentState.tsx` | **Modify** | Add `useHistoricalState(start30)` call, render "Last 30 Trading Days" panel at bottom of left column |
| `frontend/src/pages/History.tsx` | **Modify** | Render `<RegimeLegend />` between caption and VIX toggle as a separate sequential element |
| `frontend/tests/smoke/smoke.spec.ts` | **Modify** | Extend existing tests to assert new UI elements are visible |

---

## Chunk 1: Shared utility + RegimeLegend + History page

### Task 1: Extract `buildRegimeBands` into a shared utility

**Files:**
- Create: `frontend/src/lib/chartUtils.ts`
- Modify: `frontend/src/components/charts/RegimeChart.tsx`

- [ ] **Step 1: Create `chartUtils.ts`**

```typescript
// frontend/src/lib/chartUtils.ts
import type { HistoricalPoint } from '../types/api'

export function buildRegimeBands(data: HistoricalPoint[]): { start: string; end: string; regime: string }[] {
  const bands: { start: string; end: string; regime: string }[] = []
  let current: { start: string; regime: string } | null = null
  for (const pt of data) {
    if (!current || current.regime !== pt.regime) {
      if (current) bands.push({ ...current, end: pt.date })
      current = { start: pt.date, regime: pt.regime }
    }
  }
  if (current && data.length > 0) {
    bands.push({ ...current, end: data[data.length - 1].date })
  }
  return bands
}
```

- [ ] **Step 2: Update `RegimeChart.tsx` to import from `chartUtils`**

In `frontend/src/components/charts/RegimeChart.tsx`, replace the locally defined `buildRegimeBands` function and add the import:

Add at the top (after existing imports):
```tsx
import { buildRegimeBands } from '../../lib/chartUtils'
```

Delete the local `buildRegimeBands` function body (lines 18–31 in the current file). The import replaces it.

- [ ] **Step 3: Verify `RegimeChart` still compiles — run the dev server briefly**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit the refactor**

```bash
git add frontend/src/lib/chartUtils.ts frontend/src/components/charts/RegimeChart.tsx
git commit -m "refactor: extract buildRegimeBands to shared chartUtils"
```

---

### Task 2: Write failing smoke test for the regime legend

**Files:**
- Modify: `frontend/tests/smoke/smoke.spec.ts` (History page describe block, ~line 209)

- [ ] **Step 5: Add the failing test**

Inside the `'History page'` describe block in `smoke.spec.ts`, add:

```typescript
test('regime color legend shows Calm, Elevated, Turbulent chips', async ({ page }) => {
  await expect(page.getByText('Calm').first()).toBeVisible()
  await expect(page.getByText('Elevated').first()).toBeVisible()
  await expect(page.getByText('Turbulent').first()).toBeVisible()
})
```

- [ ] **Step 6: Run the test and confirm it fails**

```bash
cd frontend && npx playwright test --grep "regime color legend" --reporter=list
```

Expected: FAIL — "Calm" / "Elevated" / "Turbulent" not found on History page.

---

### Task 3: Create `RegimeLegend.tsx`

**Files:**
- Create: `frontend/src/components/ui/RegimeLegend.tsx`

- [ ] **Step 7: Create the component**

```tsx
import { regimeColor } from '../../lib/tokens'

const REGIMES = [
  { key: 'calm', label: 'Calm' },
  { key: 'elevated', label: 'Elevated' },
  { key: 'turbulent', label: 'Turbulent' },
] as const

export default function RegimeLegend() {
  return (
    <div className="flex gap-3 items-center">
      {REGIMES.map(({ key, label }) => (
        <span key={key} className="flex items-center gap-1.5">
          <span style={{ color: regimeColor[key], fontSize: 11 }}>●</span>
          <span style={{ color: '#94a3b8', fontSize: 10 }}>{label}</span>
        </span>
      ))}
    </div>
  )
}
```

> Note: `gap-1.5` (6px) between the circle and label within each chip — readable at a glance without being cramped.

---

### Task 4: Integrate `RegimeLegend` into `History.tsx`

**Files:**
- Modify: `frontend/src/pages/History.tsx`

- [ ] **Step 8: Add the import**

```tsx
import RegimeLegend from '../components/ui/RegimeLegend'
```

- [ ] **Step 9: Insert `<RegimeLegend />` as its own element between caption and toggle**

Find the "What happened over time?" panel block (around line 35–41):

```tsx
<Panel title="What happened over time?">
  <p className="text-[10px] mb-3" style={{ color: '#64748b' }}>
    Shaded bands show the market regime on each day. A darker shade indicates higher stress.
  </p>
  <div className="flex justify-end mb-2">{toggleBtn}</div>
  <RegimeChart data={data.data} showVix={showVix} />
</Panel>
```

Replace with:

```tsx
<Panel title="What happened over time?">
  <p className="text-[10px] mb-2" style={{ color: '#64748b' }}>
    Shaded bands show the market regime on each day. A darker shade indicates higher stress.
  </p>
  <div className="mb-2">
    <RegimeLegend />
  </div>
  <div className="flex justify-end mb-2">{toggleBtn}</div>
  <RegimeChart data={data.data} showVix={showVix} />
</Panel>
```

> Reading order: (1) caption, (2) legend chips, (3) VIX toggle, (4) chart. Each element is its own block, preserving the visual hierarchy from the spec.

- [ ] **Step 10: Run the legend smoke test — confirm it now passes**

```bash
cd frontend && npx playwright test --grep "regime color legend" --reporter=list
```

Expected: PASS

- [ ] **Step 11: Run the full History describe block — confirm no regressions**

```bash
cd frontend && npx playwright test --grep "History page" --reporter=list
```

Expected: all History tests pass.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/components/ui/RegimeLegend.tsx frontend/src/pages/History.tsx frontend/tests/smoke/smoke.spec.ts
git commit -m "feat: add regime color legend to History chart"
```

---

## Chunk 2: MiniRegimeChart + Current State integration

### Task 5: Write failing smoke test for the Recent Context card

**Files:**
- Modify: `frontend/tests/smoke/smoke.spec.ts` (Current State describe block, ~line 153)

- [ ] **Step 1: Add the failing test**

Inside the `'Current State page'` describe block, add:

```typescript
test('"Last 30 Trading Days" panel renders with a chart', async ({ page }) => {
  const panelTitle = page.getByText('Last 30 Trading Days')
  await expect(panelTitle).toBeVisible()
  // Panel.tsx structure: title div is a direct child of the Panel root div.
  // One level up from the title div lands on the Panel root, which contains the chart SVG.
  const panel = panelTitle.locator('..')
  await expect(panel.locator('svg').first()).toBeVisible()
})
```

> The SVG assertion is scoped to the Panel root (one level up from the title div, per `Panel.tsx`'s DOM structure) to avoid a false positive from the existing gauge/rail SVGs already on this page.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd frontend && npx playwright test --grep "Last 30 Trading Days" --reporter=list
```

Expected: FAIL — panel title not found.

---

### Task 6: Create `MiniRegimeChart.tsx`

**Files:**
- Create: `frontend/src/components/charts/MiniRegimeChart.tsx`

- [ ] **Step 3: Create the component**

```tsx
import {
  ComposedChart, Line, XAxis, YAxis, ResponsiveContainer,
  ReferenceArea, ReferenceLine,
} from 'recharts'
import type { HistoricalPoint } from '../../types/api'
import { buildRegimeBands } from '../../lib/chartUtils'

interface MiniRegimeChartProps {
  data: HistoricalPoint[]
}

const REGIME_COLORS: Record<string, string> = {
  calm: '#4ade80',
  elevated: '#fbbf24',
  turbulent: '#f87171',
}

export default function MiniRegimeChart({ data }: MiniRegimeChartProps) {
  if (data.length === 0) return null

  const bands = buildRegimeBands(data)
  const todayDate = data[data.length - 1].date

  return (
    <ResponsiveContainer width="100%" height={120}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <XAxis dataKey="date" hide />
        <YAxis yAxisId="spy" hide />
        {bands.map((b, i) => (
          <ReferenceArea
            key={i}
            yAxisId="spy"
            x1={b.start}
            x2={b.end}
            fill={REGIME_COLORS[b.regime] ?? '#64748b'}
            fillOpacity={0.12}
          />
        ))}
        <Line
          yAxisId="spy"
          dataKey="close"
          stroke="#42a5f5"
          strokeWidth={1.5}
          dot={false}
          name="SPY"
          isAnimationActive={false}
        />
        <ReferenceLine
          yAxisId="spy"
          x={todayDate}
          stroke="#06b6d4"
          strokeWidth={1}
          strokeDasharray="3 3"
          label={{ value: 'Today', position: 'insideTopRight', fill: '#06b6d4', fontSize: 8 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
```

> `<XAxis dataKey="date" hide />` is required so Recharts can resolve date strings to pixel x-coordinates for `ReferenceArea` and `ReferenceLine`. `yAxisId="spy"` is present on `<YAxis>`, `<Line>`, all `<ReferenceArea>` elements, and `<ReferenceLine>` — required by Recharts when a named YAxis is declared. Both axes are hidden so the chart stays clean at 120px height.

---

### Task 7: Integrate `MiniRegimeChart` into `CurrentState.tsx`

**Files:**
- Modify: `frontend/src/pages/CurrentState.tsx`

- [ ] **Step 4: Add imports**

```tsx
import MiniRegimeChart from '../components/charts/MiniRegimeChart'
import { useHistoricalState } from '../hooks/useHistoricalState'
```

- [ ] **Step 5: Compute `start30` and call the hook**

Inside the `CurrentState` function body, after the existing hook calls (line ~21):

```tsx
const start30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const { data: recentData, loading: recentLoading } = useHistoricalState(start30)
```

- [ ] **Step 6: Add the "Last 30 Trading Days" panel to the bottom of the left column**

Find the left column `<div className="space-y-4">` (around line 79). It contains a narrative panel and an optional delta panel. Add the new panel after them:

```tsx
<div className="space-y-4">
  <Panel title="What this means right now">
    {/* existing content — do not change */}
  </Panel>

  {data.delta && (
    <Panel title="Why it changed since last refresh">
      <DeltaRows delta={data.delta} />
    </Panel>
  )}

  <Panel title="Last 30 Trading Days">
    {recentLoading ? (
      <div className="h-[120px] rounded" style={{ background: '#0c1020' }} />
    ) : recentData && recentData.data.length > 0 ? (
      <MiniRegimeChart data={recentData.data} />
    ) : null}
  </Panel>
</div>
```

> Skeleton background is `#0c1020` (the `surface` token) — matches the Panel background so it blends as a quiet placeholder, not a flash of dark page-background color.

- [ ] **Step 7: Verify TypeScript — no compile errors**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Run the mini-chart smoke test — confirm it now passes**

```bash
cd frontend && npx playwright test --grep "Last 30 Trading Days" --reporter=list
```

Expected: PASS

- [ ] **Step 9: Run the full Current State describe block — confirm no regressions**

```bash
cd frontend && npx playwright test --grep "Current State page" --reporter=list
```

Expected: all Current State tests pass.

- [ ] **Step 10: Run the full smoke suite**

```bash
cd frontend && npx playwright test --reporter=list
```

Expected: all tests pass (or same pass rate as before these changes).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/charts/MiniRegimeChart.tsx frontend/src/pages/CurrentState.tsx frontend/tests/smoke/smoke.spec.ts
git commit -m "feat: add Recent Context mini-chart to Current State page"
```

---

## Done

Both new components are live, `buildRegimeBands` is shared (not duplicated), tests cover the new UI elements, and no existing tests are broken.
