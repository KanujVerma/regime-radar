# RegimeRadar — Graph & Page Redesign

**Date:** 2026-05-24  
**Status:** Approved, pending implementation plan

## Context

Current State and Scenario Explorer have a strong visual direction. The rest of the product — History, Event Replay, Signal Breakdown — does not feel like part of the same product. This spec defines a unified chart system ("Cinematic Instrument") and per-page redesigns so everything inherits the same brand DNA.

### Locked decisions
- **Chart system:** Direction C — Cinematic Instrument. Extend Current State's brand *into* the charts. One surgical annotation style borrowed from the editorial direction.
- **Chart ambition:** Polish + new interactions — crosshair/readout, synced hover, unified tooltip, hover-to-focus, regime glow, annotations, brush-to-zoom, date-range, real Event Replay scrubber/playback.
- **Event Replay:** becomes a genuine scrubber/playback, matching its name.
- **Backend:** design-first; scope engineering after.
- **Scenario Explorer layout:** blend — desktop Balanced Split (controls left, sticky result right); mobile Control Deck stack (controls above, output below); visual emphasis borrowed from Result Stage direction.
- **Signal Breakdown diverging chart:** v1 direction, with readability guardrail (see §4 page breakdown).
- **History feed → annotation linking:** v1.

---

## Design principle

> **Clarity beats flourish.** Every glow, annotation, hover state, and motion must improve interpretation of the data. If a visual element could be removed without losing information or reducing usability, remove it. This tool should feel premium and serious — not just animated.

This governs all tradeoffs in implementation. When unsure whether to add a visual treatment, ask: "Does this help the user read the data faster or more accurately?" If the answer is no, skip it.

---

## Breakpoint reference

| Label | Range | Notes |
|-------|-------|-------|
| Desktop | ≥1024px (lg+) | Two-column layouts, sidebar visible |
| Tablet | 768–1023px (md–lg) | Currently collapses to mobile layout (sidebar → BottomNav). Some intermediate adaptations apply. |
| Mobile | <768px (<md) | Single-column, BottomNav |

"Mobile" in this spec means <768px. "Tablet" behavior is noted where it differs from desktop. All existing `lg:` breakpoints are preserved.

---

## Current problems

**Two-and-a-half style systems coexist.**
- Current State / History / Event Replay: semantic system (`Panel` + `MetricCard` + `tokens.ts`).
- `pages/ModelDrivers.tsx` (Signal Breakdown): inline-hardcoded hex throughout.
- `components/ClosestHistoricalSetups.tsx` / `AnalogCard.tsx`: a third palette (`bg-white/[0.03]`, `border-white/10` Tailwind opacity) that clashes with the token system.

**Charts are functional, not designed.**
- All recharts at a fixed `height={240}`.
- Tooltip styling triplicated: `charts/ChartTooltip.tsx` + inline copies in `RegimeChart.tsx` + `MiniRegimeChart.tsx`.
- No crosshair, no synced hover, no zoom/brush, no first-class annotations.
- Chart components hardcode hex colors instead of importing from `tokens.ts`.

**Width is wasted.** Every page is a single `px-6 py-5 space-y-*` vertical scroll. Horizontal width is almost never used for related panels.

**Event Replay doesn't replay.** `pages/EventReplay.tsx` is a static chart per event with mismatched stat grids (`grid-cols-2` then `grid-cols-3`, neither responsive).

**Scenario Explorer is lopsided.** Fixed 276px left rail stacks presets + 6 bare `<input type=range>` + threshold section against a short right column (verdict + compact tripod + driver cards).

**No shared type or spacing scale.** Sizes are ad-hoc inline or Tailwind arbitrary values (`text-[9px]`), re-declared per component.

---

## The unified system

### Chart foundation — Cinematic Instrument

**`ChartShell` (new: `frontend/src/components/charts/ChartShell.tsx`)**

Mandatory for all major page-level recharts charts (`RegimeChart`, `RiskLineChart`, `EventReplayChart`, Signal Breakdown's contribution chart). **Not applied to** `MiniRegimeChart` (sparkline at small scale — CSS gradient approach is correct at that size; see below) or `ProbabilityTripod` (framer-motion, not recharts).

Provides:
- Header row: title (token typography), optional legend, optional right-aligned control slot (date-range, series toggles, VIX toggle).
- Responsive height presets: `compact` / `standard` / `tall` — replaces hardcoded `height={240}`.
- Opt-in ambient regime glow backdrop (radial gradient keyed to regime color, matching Current State hero).

**`MiniRegimeChart` fate:** survives as a special-case sparkline. Its CSS gradient regime band approach is appropriate for the compact dimensions where SVG `ReferenceArea`s would be visually noisy. The one change: its inline tooltip copy gets consolidated to use `ChartTooltip`. No `ChartShell` wrapper.

**Crosshair + readout (consolidates 3 tooltip implementations)**  
*Dependency: frontend-only*

- Vertical crosshair snaps to nearest data point on hover.
- Pinned glass readout chip: `background: colors.glass`, `backdropFilter: blur(12px)`, `borderLeft: 3px solid accentColor`, `borderRadius: 8`. Shows date + each series value + units.
- `ChartTooltip.tsx` becomes the single implementation. Inline copies in `RegimeChart.tsx` and `MiniRegimeChart.tsx` deleted.
- **Synced hover** across stacked charts on the same page (History, Event Replay): shared hover-X context object so one cursor drives all charts simultaneously.

**Hover-to-focus**  
*Dependency: frontend-only*

- Hovering a series or legend item: hovered series stays at full opacity; siblings dim to ~35% via framer-motion `animate`.
- Legend items become toggles (click to show/hide a series).

**Unified regime bands (`<RegimeBands>` + `buildRegimeBands`)**  
*Dependency: frontend-only*

Consolidate three divergent implementations:
- `RegimeChart.tsx`: SVG `ReferenceArea` per band.
- `MiniRegimeChart.tsx`: CSS gradient (exempt from this consolidation — stays as-is for sparkline use).
- `EventReplayChart.tsx`: local `buildBands` util.

→ Single `buildRegimeBands(data)` util in `frontend/src/lib/` + `<RegimeBands>` recharts renderer using `colors.calmGlow` / `elevatedGlow` / `turbulentGlow` for subtle per-regime fill.

**`ChartAnnotation` (new: `frontend/src/components/charts/ChartAnnotation.tsx`)**  
*Dependency: frontend-only (annotation data embedded in existing API responses)*

Pinned marker + glass callout. Data shape: `{ date: string, label: string, description?: string, side?: 'left' | 'right' }`. Capped at ~2–3 per chart. Not scrollytelling.

**New capabilities**

| Capability | Dependency |
|-----------|-----------|
| Brush-to-zoom on History | Frontend-only — recharts `<Brush>` restyled, operates on existing data |
| Date-range control + History start date | Backend-light — `useHistoricalState` gains `{ start, end }` params; `/historical-state` endpoint gains `start`/`end` query params |
| `Scrubber` transport for Event Replay | Frontend-only — existing `/event-replay/{name}` response is the full dataset; playback slices client-side |
| History feed → chart annotation linking | Frontend-only — date from `ChangelogFeed` entry pins `ChartAnnotation` at that x-position |
| Signal Breakdown contribution chart | Frontend-only — uses existing driver explanation data |
| All other chart system work | Frontend-only |

**`Scrubber` (new: `frontend/src/components/charts/Scrubber.tsx`)**  
Film-timeline transport: play/pause button + draggable playhead + day counter. Drives progressive reveal of a time series (chart shows data up to playhead; future dimmed). Used by Event Replay; generic and reusable.

**Motion conventions (carry forward, extend)**
- Signature easing `[0.16, 1, 0.3, 1]`, ~0.35s mounts, staggered `delay: i*0.06` — unchanged.
- Charts: draw-on line/area on mount and data change (stroke-dashoffset animation or recharts `animationDuration`).
- Crosshair and readout updates: instant. No spring or delay — must feel responsive.
- Keep `pulse-{regime}` dominant-flip glow and `AnimatedNumber` from `ProbabilityTripod`.

### Page language

**Glass policy** (extend `tokens.ts` comment)
- Tier 1 glass (`colors.glass` + `backdrop-blur`): page hero and the chart readout chip only.
- Tier 2 `Panel`: flat `colors.surface`, `1px colors.border`, `rounded-xl` — all standard content and charts.
- Tier 3 `MetricCard`: `colors.surfaceElevated`.
- No glass outside these contexts. No decorative `backdrop-blur`.

**Typography scale (add to `tokens.ts`)**
```ts
typography: {
  microLabel: { fontSize: 9, letterSpacing: '0.10em', textTransform: 'uppercase', color: colors.textMuted },
  sectionTitle: { fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' },
  statSm:  { fontSize: 22, fontWeight: 800 },
  statMd:  { fontSize: 32, fontWeight: 800 },
  statLg:  { fontSize: 40, fontWeight: 900 },
  statXl:  { fontSize: 52, fontWeight: 900 },
}
```
(`colors.textMuted` = `#64748b` — the existing token, replacing the ad-hoc `text-[9px]` / inline sizes scattered across components.)

**Spacing constants (add to `tokens.ts`)**
```ts
spacing: {
  pageX: '1.5rem',    // px-6
  pageY: '1.25rem',   // py-5
  sectionGap: '1.5rem',
  panelPad: '1.25rem',
}
```

---

## Per-page design

### History — `frontend/src/pages/History.tsx`

**Layout**
- Compact **regime-context hero strip** at top: current regime badge + active date range.
- **Linked time-chart stack**: `RegimeChart` (SPY + regime bands + optional VIX) and `RiskLineChart` share one X-axis domain, one synced crosshair, and one date-range/brush control rendered in the `ChartShell` shared header. Both charts inside `ChartShell`.
- Desktop: `ChangelogFeed` in a **right companion column** (side by side with charts). Tablet: same split at a narrower ratio. Mobile: feed below charts.

**Chart treatment** (Cinematic Instrument)
- `ChartShell` with `tall` preset.
- Synced hover-X context shared between the two stacked charts.
- Regime bands via `<RegimeBands>`.
- VIX as a **legend toggle** in `ChartShell` header — replaces the hand-rolled inline button.
- Hover-to-focus: hovering VIX dims SPY and vice versa.

**Interaction model**
- Date-range picker + **brush-to-zoom** (headline new capability); "reset zoom" affordance.
- Click a `ChangelogFeed` entry → pins a `ChartAnnotation` on the charts at that date + highlights the feed entry. (v1)
- Legend toggles for VIX and any other series.

**Motion / feedback**
- Draw-on lines on load and on range change.
- Crosshair: instant.
- Annotation callouts: fade + slide in via signature easing.
- Feed entries: staggered mount.

**Surface / card**
- Charts: Tier-2 `Panel` via `ChartShell`.
- Feed: Tier-2 `Panel`.
- Glass only on readout chip.

**Mobile**
- Charts full-width, still synced crosshair.
- Date-range control compact.
- Feed below.
- Brush: range-select buttons (touch-friendly fallback for drag brush).

---

### Event Replay — `frontend/src/pages/EventReplay.tsx`

**Layout**
- Event selector → **shared segmented control** component (replaces hand-styled buttons; same component reused across pages).
- **Replay stage**: `ChartShell` (`tall` preset) with `EventReplayChart` + `Scrubber` transport directly beneath the chart.
- Stats → a **single coherent `MetricCard` row** (fixes the `grid-cols-2` / `grid-cols-3` mismatch). Cards update live at the playhead position (e.g. "risk today", "days into event", "peak so far").
- Narrative + Takeaway as Tier-2 `Panel`s below.

**Chart treatment**
- `EventReplayChart` on `ChartShell` foundation.
- `✕` actual-transition markers → `ChartAnnotation`s.
- First-crossing `ReferenceLine` → `ChartAnnotation` with label.
- Moving playhead `ReferenceLine` tracks `Scrubber` position.
- Progressive reveal: line/area draws up to playhead; future data at ~25% opacity.

**Interaction model**
- Play/pause → animates risk day-by-day at a readable pace.
- Draggable playhead → jump to any day.
- Hover when paused → crosshair + readout.
- Event switch → stop playback, reset to start of new event.

**Motion / feedback**
- Progressive area/line reveal driven by playhead.
- Regime bands light up as playhead enters each regime.
- Stat card numbers spring via `AnimatedNumber` (reuse `useSpring` from `ProbabilityTripod`).
- `pulse-{regime}` glow on regime crossing.

**Surface / card**
- Replay stage: Tier-2 `Panel` via `ChartShell`.
- Stats: Tier-3 `MetricCard`s.
- Narrative/takeaway: Tier-2 `Panel`.

**Mobile**
- Chart full-width; `Scrubber` below with large touch targets.
- Stat cards single-column.
- Segmented control wraps.

---

### Signal Breakdown — `frontend/src/pages/ModelDrivers.tsx`

**Layout**
- Keep overall structure; **migrate fully off inline hex onto `tokens.ts` / `Panel`** — this is the biggest consistency gain on this page.
- Hero adopts the shared Tier-1 glass pattern (matching Current State: `colors.glass`, regime glow, big risk % right-aligned using `typography.statXl`).
- Driver sections as proper Tier-2 `Panel`s.
- **Reconcile `ClosestHistoricalSetups` / `AnalogCard`**: replace `bg-white/[0.03]` / `border-white/10` with token equivalents.
- Extract `ReliabilityTable` (currently inline at bottom of `ModelDrivers.tsx`) into `components/ui/ReliabilityTable.tsx`.

**Chart treatment — diverging contribution chart (v1, with readability guardrail)**  
*Dependency: frontend-only*

Preferred v1 direction: a **horizontal diverging bar chart** around a center axis — "raises risk" bars extend right (red), "holds risk in check" bars extend left (green). Uses `colors.red` / `colors.green`, token typography. Built with `ChartShell`.

**Readability guardrail:** implement the diverging chart in v1 *only if* it remains immediately legible without explanation. If the center-axis structure introduces visual noise or requires a moment of interpretation, fall back to **upgraded grouped `DriverBar`s** — same token colors, hover-to-focus, staggered animation, within the same `ChartShell` wrapper. The goal is a page that feels more analytical, not more complicated. Make this call during implementation once real driver data is rendered.

Existing `DriverBar`s keep their `barFill` animation for the global-importance ranking list (this section is independent of the diverging/grouped decision).

**Interaction model**
- Hover a driver bar → focus + glass definition callout; others dim (hover-to-focus).
- Reliability accordion stays; restyled with token colors and `Panel`.

**Motion / feedback**
- Staggered `barFill` on both bar types.
- Diverging bars animate from center axis outward on load (or grouped bars animate left-to-right as today); both use the same easing.
- Hover-to-focus via opacity transition.

**Surface / card**
- Hero: Tier-1 glass.
- Driver sections, analog section, reliability: Tier-2 `Panel`.
- Stat chips: Tier-3 `MetricCard`.
- Single token palette throughout. No Tailwind opacity divergence.

**Mobile**
- Hero stacks: risk % below headline (remove `minWidth:72` + `<br/>`, use flex-wrap).
- Two-column driver section → single column.
- Analog cards `grid-cols-1`.
- Contribution chart full-width (stays readable in either diverging or grouped form).

---

### Scenario Explorer — `frontend/src/pages/ScenarioExplorer.tsx`

**Layout**  
*Dependency: frontend-only*

- **Desktop (≥1024px):** Two-column Balanced Split.
  - Left (~38%): control panel, compact, scrollable.
  - Right (~62%): **sticky** result column (`position: sticky; top: 1.25rem; max-height: calc(100vh - 5rem); overflow-y: auto`). Visually dominant.
- **Tablet (768–1023px):** Same two-column split at a narrower 42/58 ratio; sticky result stays.
- **Mobile (<768px):** Control Deck stack. Controls first in DOM, output below. Sticky disabled.

**Control redesign (shrinks left materially)**  
Replace bare `<input type=range>` with **`ScenarioSlider`** (new: `frontend/src/components/ui/ScenarioSlider.tsx`):
```
[Label ·●· sensitivity dot]  [live value]
━━━━━●━━━━━━━━━━━━━━━━  (4px track, colors.cyan accent)
[min]                [max]  ← shown on hover only
```
Target vertical rhythm: ~48px per slider row vs current ~72px.

Group controls into collapsible sections via `AnimatePresence`:
- **Presets** (chip strip; collapses after selection)
- **Drivers** (6 factor sliders; default open)
- **Threshold** (1 threshold slider + stats; default collapsed)

Collapsed section headers show summary state (e.g. "Threshold: 0.42 · 3 crises caught").

**Output enrichment (grows right to balance heights)**

- `ProbabilityTripod`: enlarged (bigger numerics via `typography.statXl` for dominant, `statLg` for others), wider tiles, stronger dominant-tile glow.
- Driver cards: flow in a **2-col grid** beneath the tripod instead of single-column.
- Verdict text block uses token typography.

**Interaction model**
- Dragging any slider → immediate update to sticky verdict + tripod (6ms backend latency makes this instant).
- Sensitivity dots communicate impact before dragging.
- Preset chips apply a full slider state in one click.
- Threshold slider stays linked to active scenario (existing behavior).

**Motion / feedback**
- Keep `AnimatedNumber` spring, bar width springs, `pulse-{regime}` dominant-flip glow.
- Collapsible sections: `AnimatePresence` height slide.
- Sticky column: `transform: translateZ(0)` to avoid repaint jank. Reserve column height during load to avoid layout shift.

**Surface / card**
- Controls: Tier-2 `Panel`(s).
- Tripod section: Tier-2 wrapper; individual dominant-tile glow already correct.
- Driver cards: Tier-2.

**Mobile**
- Controls: horizontal-scroll preset chip row + compact slider stack + threshold collapsed.
- Output: full-width below.
- Tripod full-width.

---

## Cross-cutting refactors (do before page work)

| Item | Files | Dependency |
|------|-------|-----------|
| Consolidate tooltip | Delete inline copies in `RegimeChart.tsx`, `MiniRegimeChart.tsx`; `ChartTooltip.tsx` = single source | Frontend-only |
| Token adoption in all charts | `charts/*.tsx` — replace hardcoded hex with `colors.*` | Frontend-only |
| Add typography + spacing scale | `lib/tokens.ts` | Frontend-only |
| `buildRegimeBands` + `<RegimeBands>` | New `lib/regimeBands.ts`; remove local implementations from `RegimeChart.tsx`, `EventReplayChart.tsx` | Frontend-only |
| Reconcile `AnalogCard` palette | `components/AnalogCard.tsx`, `components/ClosestHistoricalSetups.tsx` | Frontend-only |
| Extract `ReliabilityTable` | `components/ui/ReliabilityTable.tsx` (new) | Frontend-only |
| `start`/`end` on `/historical-state` | `hooks/useHistoricalState.ts` + `src/api/history.py` (or equivalent) | Backend-light |

---

## Verification

1. `cd frontend && npm run dev` — walk each page at **desktop** (1280px), **tablet** (900px), **mobile** (375px).
2. **History:** synced crosshair across both charts; brush-zoom + date-range (confirm backend `start`/`end` param works); click a `ChangelogFeed` entry and confirm annotation pins on charts.
3. **Event Replay:** play button animates day-by-day; stat cards update at playhead; scrubber is draggable; pausing then hovering shows crosshair/readout.
4. **Signal Breakdown:** single token palette (no `bg-white/[0.03]`); diverging OR grouped chart animates on load; hover-to-focus dims other bars.
5. **Scenario Explorer:** sticky result column visible while scrolling sliders on desktop; no layout shift on slider drag; mobile stacks correctly (controls above output).
6. `grep -r '#06b6d4\|#4ade80\|#fbbf24\|#f87171' frontend/src/components/charts` → zero results (tokens used everywhere).
7. Confirm exactly one `ChartTooltip` component exists (no inline copies).
8. Run test suite; confirm all tests pass, no regressions on existing data rendering / loading / error states.
9. Use `playwright-skill` or `webapp-testing` to screenshot each page and validate key interactions programmatically.

---

## Open questions (resolved)

| Question | Decision |
|----------|----------|
| Signal Breakdown diverging chart in v1? | Yes — preferred; fall back to upgraded grouped DriverBars if readability suffers |
| History feed → annotation linking in v1? | Yes — low cost, high UX payoff, real product behavior |
| Event Replay scrubber needs backend changes? | No — full dataset already returned by `/event-replay/{name}`; playback is client-side |
