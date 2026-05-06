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

**Condition:** `Math.abs(data?.delta ?? 0) < 0.02` — transition risk delta less than 2 percentage points from baseline. This covers the "reset to current market" default and small slider movements.

**Rendering:**
- Dashed border container (not just blank space)
- Icon: `⇄` centered, in a small circle with dimmed background
- Title: **"Scenario is still close to current market"** — `font-weight: 600`, muted color `#475569`
- Sub-copy: **"Adjust a slider or select a preset to see what starts driving the scenario away from the current market."** — smaller, dimmer `#334155`, max-width constrained, centered

---

### State 2: Active state

**Condition:** `Math.abs(data.delta) >= 0.02`

#### Driver cards

The card framing is **bidirectional** — it adapts based on whether `data.delta` is positive (scenario raises risk) or negative (scenario lowers risk).

**When `data.delta > 0` (rising risk):**

1. **Primary card** (required) — `driver_deltas` entry with highest positive `delta_value`
2. **Secondary card** (if exists) — second highest positive `delta_value`
3. **Partial offset divider** (conditional) — rendered only if an offset card follows
4. **Offset card** (optional) — `driver_deltas` entry with most negative `delta_value`, only if `delta_value < -0.01`

Badge: **"RAISES RISK"** on primary/secondary, **"OFFSETS"** on offset card.

**When `data.delta < 0` (falling risk, e.g. Calm Recovery preset):**

1. **Primary card** (required) — `driver_deltas` entry with most negative `delta_value`
2. **Secondary card** (if exists) — second most negative `delta_value`
3. **Partial offset divider** (conditional) — rendered only if a counter card follows
4. **Counter card** (optional) — `driver_deltas` entry with highest positive `delta_value`, only if `delta_value > 0.01`

Badge: **"LOWERS RISK"** (green `#4ade80` on `#0a2212`) on primary/secondary, **"RAISES RISK"** on counter card.

**Each card contains:**
- Left: directional arrow (`↑` red `#f87171` for risk-raising, `↓` green `#4ade80` for risk-lowering)
- Center body:
  - Feature name: `plain_label` from driver_deltas
  - Baseline → Scenario values: formatted using existing `formatDriverVal()`. Source: `data.baseline_inputs[feature]` for baseline, current `inputs[feature]` for scenario
  - Interpretation line: plain-English explanation, italic, dimmed. One sentence per feature (see mapping below)
- Right: badge as described above

**Visual treatment:**
- Amplifier cards: `background: #0d1526`, `border: #1e2a3a`
- Offset card: `background: #070e1a`, `border: #132218` — slightly dimmer to de-emphasize

**Partial offset divider:** rendered only when an offset card is present
```
──────  partial offset  ──────
```
`font-size: 8px`, `color: #1e2a3a`, lines via `::before`/`::after` pseudo-elements

#### Interpretation text (per feature)

| Feature | Amplifier text | Offset text |
|---|---|---|
| `drawdown_pct_504d` | "Deepening drawdown is the primary stress signal the model is responding to." | "Drawdown remains contained — limiting how much stress can build." |
| `vix_level` | "Fear gauge rising — adds to the stress reading." | "VIX is low — suppressing the stress reading." |
| `vix_chg_5d` | "Fear is accelerating over the past week — adds momentum to the stress signal." | "Fear has been receding — partially offsetting other stress inputs." |
| `rv_20d_pct` | "Realized volatility is elevated relative to recent history — amplifying the regime signal." | "Volatility is below recent norms — a calming factor." |
| `ret_20d` | "Recent returns are weak — reinforcing the stress reading." | "Medium-term momentum is holding — limiting how much the stress reading can rise." |
| `dist_sma50` | "Price is stretched below its 50-day average — adding to the stress signal." | "Price remains above its 50-day average — a stabilizing factor." |
| *(fallback)* | "This signal is amplifying the transition risk." | "This signal is partially offsetting the stress reading." |

---

#### Changed-input strip

Rendered **below the driver cards**, only in active state. Separated by a thin `border-top: 1px solid #0d1526`.

- Label: `CHANGED:` in `8px` uppercase, color `#334155`
- Pills: one per input where `Math.abs(inputs[key] - data.baseline_inputs[key]) > 0.001`
- Each pill: `"[plain label] [arrow] [delta]"` — e.g., `Drawdown ↑ worse`, `VIX ↑ +3.1`
- Delta formatting: use existing `formatDriverVal()` for magnitude; direction arrow `↑` red or `↓` green
- Pill style: `background: #0d1526`, `border: #1e2a3a`, `border-radius: 10px`, `font-size: 9px`
- No pill shown for unchanged inputs

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/pages/ScenarioExplorer.tsx` | Replace existing driver list with new empty/active state logic and card rendering |
| `frontend/src/lib/narratives.ts` | Add `getDriverInterpretation(feature, isAmplifier): string` function |

No new components needed. Driver card markup stays inline in `ScenarioExplorer.tsx` — it's specific to this page and not reusable elsewhere.

---

## Data Sources

All data already available from existing `/scenario` API response:
- `data.delta` — transition risk delta (used for empty/active threshold)
- `data.driver_deltas[]` — `{ feature, plain_label, delta_value }` — sorted by backend
- `data.baseline_inputs` — `Record<string, number>` — current market values per feature
- Local `inputs` state — current scenario values per feature (already in component)

No new API calls. No new hooks.

---

## Thresholds & Edge Cases

- **Empty state threshold:** `|delta| < 0.02` — small enough that nearly any meaningful preset triggers active state; large enough that floating-point noise from unchanged sliders stays hidden
- **Offset card threshold:** `delta_value < -0.01` — prevents near-zero negatives from showing as offsets
- **No amplifier cards at all:** If `driver_deltas` is empty but `|delta| >= 0.02` (shouldn't happen with current backend, but defensively) — show active state with a single fallback line: "Risk is elevated but no single signal is dominant."
- **Changed-input strip threshold:** `|inputs[key] - baseline[key]| > 0.001` — filters floating-point noise from unchanged sliders

---

## What Is Not Changing

- The verdict block at the top of the right column
- The ProbabilityTripod component
- The alert threshold section
- The left column (presets, sliders)
- The backend API
- Any other page
