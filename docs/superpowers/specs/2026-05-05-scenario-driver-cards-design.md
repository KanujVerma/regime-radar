# Scenario Explorer — Driver Cards Redesign

**Date:** 2026-05-05
**Scope:** Frontend only. No backend changes. Pure rework of the "What's driving this scenario" section in `ScenarioExplorer.tsx`.

---

## Problem

The right column of Scenario Explorer has significant blank space below the probability tripod. The existing "What's Driving This Scenario" section shows only a static label ("Biggest input shifts driving the scenario difference") with no visual content until the user has moved sliders substantially. There is no empty state — the section just appears blank.

---

## Design

### Section title
`What's driving this scenario` (unchanged — already correct)

---

### State 1: Empty state

**Condition:** No driver in `data.driver_deltas` has `|delta_value| >= 0.03`.

This is broader than checking `data.delta` alone. It activates when the scenario has at least one materially changed driver, even if the overall transition-risk delta is modest. It is also falsy when `data` is null (still loading or no API response yet), so loading state falls into empty.

**Rendering:**
- Dashed border container (not just blank space)
- Icon: `⇄` centered, in a small circle with dimmed background (`#0d1526` bg, `#1e2a3a` border)
- Title: **"No strong driver signal yet"** — `font-weight: 600`, muted color `#475569`
- Sub-copy: **"Adjust a slider or select a preset to see what starts driving the scenario away from the current market."** — smaller, dimmer `#334155`, max-width constrained, centered

---

### State 2: Active state

**Condition:** At least one driver in `data.driver_deltas` has `|delta_value| >= 0.03`.

#### Driver cards

Cards answer one consistent question regardless of scenario direction: **what is pushing this scenario away from the current market, and what is pushing back?** There is no top-level branching on `data.delta` sign. Instead, each card's badge and arrow color are determined by the sign of its own `delta_value`.

**Card selection:**

1. **Primary card** (required) — `driver_deltas` entry with the highest `|delta_value|` overall
2. **Secondary card** (if exists and `|delta_value| >= 0.03`) — second highest `|delta_value|`, only if it has the **same sign** as the primary card
3. **Partial offset divider** (conditional) — rendered only if an offset card follows
4. **Offset card** (optional) — first `driver_deltas` entry with the **opposite sign** to the primary card, only if `|delta_value| >= 0.01`

**Per-card badge and arrow, determined by sign of that card's `delta_value`:**

| `delta_value` sign | Arrow | Badge text | Badge colors |
|---|---|---|---|
| positive (raises risk) | `↑` red `#f87171` | `RAISES RISK` | `#f87171` on `#3d1515` |
| negative (lowers risk) | `↓` green `#4ade80` | `LOWERS RISK` | `#4ade80` on `#0a2212` |
| negative and it's the offset card | `↓` green | `OFFSETS` | same green |

**Each card contains:**
- Left: directional arrow (color per table above)
- Center body:
  - Feature name: `plain_label` from `driver_deltas` (API-provided, already user-readable)
  - Baseline → Scenario values: `data.baseline_inputs[feature]` → `inputs[feature]`, formatted using existing `formatDriverVal()`
  - Interpretation line: one plain-English sentence, italic, `#64748b`. Sourced from `DRIVER_INTERP` lookup (see below)
- Right: badge (per table above)

**Visual treatment:**
- Primary and secondary cards: `background: #0d1526`, `border: #1e2a3a`
- Offset card: `background: #070e1a`, `border: #132218` — slightly dimmer to visually de-emphasize

**Partial offset divider:** rendered only when an offset card is present
```
──────  partial offset  ──────
```
`font-size: 8px`, `color: #1e2a3a`, lines via `::before`/`::after` pseudo-elements

---

#### Interpretation text

Stored as a `const DRIVER_INTERP` lookup at the top of `ScenarioExplorer.tsx` — not in `narratives.ts`. It is only used on this page and does not warrant a shared module. Structure:

```ts
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

Fallback (feature not in map): `'This scenario differs from the current market, but no single driver clearly dominates the change.'`

The lookup key is `delta_value > 0 ? 'raisesRisk' : 'lowersRisk'` for each card independently.

---

#### Changed-input strip

Rendered **below the driver cards**, only in active state. Separated by `border-top: 1px solid #0d1526`.

- Label: `CHANGED:` — `8px` uppercase, `color: #334155`
- One pill per slider input where `Math.abs(inputs[key] - (data.baseline_inputs[key] ?? inputs[key])) > 0.001`
- Pill label: use the `label` field from `SLIDER_CONFIG` for that key — these are the shortest already-readable user-facing names
- Pill delta: direction arrow (`↑` red or `↓` green) + formatted delta using `formatDriverVal()`
- Pill style: `background: #0d1526`, `border: #1e2a3a`, `border-radius: 10px`, `font-size: 9px`, `color: #64748b`
- No pill shown for unchanged inputs

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/pages/ScenarioExplorer.tsx` | Replace existing driver section with empty/active state, driver cards, `DRIVER_INTERP` constant, changed-input strip |

No new files. No changes to `narratives.ts`, `hooks/`, `api/`, or any backend file.

---

## Data Sources

All from existing API response and local state — no new calls:
- `data.driver_deltas[]` — `{ feature, plain_label, delta_value }` — primary source for card content and active/empty threshold
- `data.baseline_inputs` — `Record<string, number>` — baseline values for baseline→scenario display and pill diffing
- `data.delta` — not used for threshold decisions; may be used for narrative context elsewhere on the page (unchanged)
- Local `inputs` state — scenario values per feature (already in component)
- `SLIDER_CONFIG` — provides `label` strings for changed-input pills

---

## Thresholds & Edge Cases

| Threshold | Value | Rationale |
|---|---|---|
| Empty → active | `driver_deltas.some(d => \|delta_value\| >= 0.03)` | Broader than delta-only check; covers regime-mix shifts |
| Secondary card eligibility | `\|delta_value\| >= 0.03` and same sign as primary | Avoids showing near-zero secondary cards |
| Offset card eligibility | opposite sign, `\|delta_value\| >= 0.01` | Prevents near-zero negatives from registering as meaningful offsets |
| Changed-input pill | `\|inputs[key] - baseline[key]\| > 0.001` | Filters floating-point noise |

**Edge case — no driver reaches threshold despite `data` existing:** Show empty state. This can happen if the API returns driver_deltas with all near-zero values (e.g., very minor slider movement). Empty state is the correct fallback.

**Edge case — primary card exists but no secondary:** Show one card only, no divider, no offset. Do not pad with a placeholder.

---

## What Is Not Changing

- The verdict block at the top of the right column
- The ProbabilityTripod component
- The alert threshold section
- The left column (presets, sliders, quick scenarios)
- `narratives.ts`
- The backend API
- Any other page
