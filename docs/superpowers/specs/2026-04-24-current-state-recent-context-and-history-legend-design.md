# Design: Recent Context Card + History Regime Legend

**Date:** 2026-04-24  
**Status:** Approved  
**Scope:** Two polish improvements — Current State page and History page

---

## 1. Recent Context Card (Current State page)

### Goal
Fill the lower-left area of the Current State page with a compact 30-day chart that shows how the market arrived at today's state. Secondary to the executive-summary content above it.

### New component: `frontend/src/components/charts/MiniRegimeChart.tsx`

**Props:**
```ts
interface MiniRegimeChartProps {
  data: HistoricalPoint[]
}
```

**Rendering:**
- `ResponsiveContainer` height: `120px`
- `ComposedChart` with no margins, no CartesianGrid
- **X-axis:** hidden entirely (`hide={true}`) — no labels, no ticks, no axis line
- **Y-axis:** hidden entirely — price scale is not meaningful at this size
- **Regime bands:** `ReferenceArea` per band, same `buildRegimeBands` logic as `RegimeChart`, `fillOpacity={0.12}` (slightly stronger than full chart's 0.08 since there's no competing line)
- **SPY line:** `dataKey="close"`, `stroke="#42a5f5"`, `strokeWidth={1.5}`, `dot={false}`, `yAxisId="spy"`
- **Today marker:** `ReferenceLine` at the last data point's date, `stroke="#06b6d4"` (brand cyan), `strokeWidth={1}`, `strokeDasharray="3 3"`, label `{ value: 'Today', position: 'insideTopRight', fill: '#06b6d4', fontSize: 8 }`
- **Tooltip:** none
- **Interactions:** none

**Colors:** reuse `REGIME_COLORS` from `RegimeChart` (`calm: #4ade80`, `elevated: #fbbf24`, `turbulent: #f87171`)

### Changes to `CurrentState.tsx`

- Compute `start30`: today's date minus 30 calendar days, `YYYY-MM-DD` string
- Call `useHistoricalState(start30)` — reuses existing hook, no new API endpoint
- Render a `<Panel title="Last 30 Trading Days">` containing `<MiniRegimeChart data={recentData.data} />` at the bottom of the **left column** (after the narrative panel and any delta panel)
- **While loading:** `<div className="h-[120px] rounded" style={{ background: '#0c1020' }} />` skeleton placeholder
- **On error or empty:** render nothing (omit the card)

**Layout placement:**
```
Left column (1fr):
  1. "What this means right now" panel  ← always shown
  2. "Why it changed since last refresh" panel  ← conditional
  3. "Last 30 Trading Days" panel  ← new, always shown when data available
```

---

## 2. Regime Color Legend (History page)

### Goal
Make the regime shading in the "What happened over time?" chart immediately readable for non-experts without requiring inference.

### New component: `frontend/src/components/ui/RegimeLegend.tsx`

**Props:** none  
**No external dependencies** — colors come from the `regimeColor` token

**Rendering:**
```tsx
<div className="flex gap-3 items-center">
  { ['calm', 'elevated', 'turbulent'].map(...) }
</div>
```

Each chip:
- A colored circle indicator: `●` character at `fontSize: 11px` in the regime color (`#4ade80`, `#fbbf24`, `#f87171`)
- A label: `"Calm"` / `"Elevated"` / `"Turbulent"` at `fontSize: 10px`, `color: #94a3b8` (textSecondary — readable at a glance, not overly faded)
- `gap-1.5` between circle and label within each chip

### Changes to `History.tsx`

Reading order in the "What happened over time?" panel:
1. Caption text: `"Shaded bands show the market regime on each day. A darker shade indicates higher stress."` ← existing
2. `<RegimeLegend />` ← new, immediately below the caption
3. VIX toggle button (right-aligned) ← existing
4. `<RegimeChart />` ← existing

The legend sits between the caption and the chart controls, so the user reads the color key before looking at the chart.

---

## Files Changed

| File | Action |
|------|--------|
| `frontend/src/components/charts/MiniRegimeChart.tsx` | Create |
| `frontend/src/components/ui/RegimeLegend.tsx` | Create |
| `frontend/src/pages/CurrentState.tsx` | Modify — add `useHistoricalState` call, render Recent Context panel |
| `frontend/src/pages/History.tsx` | Modify — add `<RegimeLegend />` between caption and VIX toggle |

No new API endpoints, no schema changes, no hook changes.

---

## Design Constraints

- Brand: dark cinematic — `#0c1020` surfaces, `#151d2e` borders, `#06b6d4` cyan accents
- MiniRegimeChart must stay compact and secondary — no hover states, no interactivity
- RegimeLegend text must be readable at a glance — use `#94a3b8` not `#64748b`
- Do not add transition-risk overlay to MiniRegimeChart
