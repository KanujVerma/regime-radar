# RegimeRadar — Graph & Page Redesign

**Date:** 2026-05-24  
**Status:** Approved, pending implementation plan

## Context

Current State and Scenario Explorer have a strong visual direction. The rest of the product — History, Event Replay, Signal Breakdown — does not feel like part of the same product. This spec defines a unified chart system ("Cinematic Instrument") and per-page redesigns so everything inherits the same brand DNA.

### Locked decisions
- **Chart system:** Direction C — Cinematic Instrument (extend Current State into the charts). Surgical annotations borrowed from editorial direction.
- **Chart ambition:** Polish + new interactions — crosshair/readout, synced hover, unified tooltip, hover-to-focus, regime glow, annotations, brush-to-zoom, date-range, real Event Replay scrubber/playback.
- **Event Replay:** becomes a genuine scrubber/playback, matching its name.
- **Backend:** design-first; scope engineering after choosing direction.
- **Scenario Explorer layout:** blend
  - lg+: Balanced Split, output-led — controls left, sticky result right.
  - mobile: Control Deck stack — controls band above, output below.
  - Visual emphasis from Direction 3: result area larger/more dominant; controls stay left.
  - Compact custom slider rows so left column shrinks materially.

---

## Current problems

**Two-and-a-half style systems coexist.**
- Current State / History / Event Replay: semantic system (`Panel` + `MetricCard` + `tokens.ts`).
- `pages/ModelDrivers.tsx` (Signal Breakdown): inline-hardcoded hex throughout.
- `components/ClosestHistoricalSetups.tsx` / `AnalogCard.tsx`: a third palette (`bg-white/[0.03]`, `border-white/10` Tailwind opacity utilities) that clashes with the token system.

**Charts are functional, not designed.**
- All recharts at a fixed `height={240}`.
- Tooltip styling triplicated: `charts/ChartTooltip.tsx` plus inline copies inside `RegimeChart.tsx` and `MiniRegimeChart.tsx`.
- No crosshair, no synced hover, no zoom/brush, no first-class annotations.
- Chart components hardcode hex colors instead of importing from `tokens.ts`.

**Width is wasted.** Every page is a single `px-6 py-5 space-y-*` vertical scroll. Horizontal width is almost never used for side-by-side related panels.

**Event Replay doesn't replay.** `pages/EventReplay.tsx` is a static chart per event with mismatched stat grids (`grid-cols-2` then `grid-cols-3`, neither responsive).

**Scenario Explorer is lopsided.** Fixed 276px left rail stacks presets + 6 bare `<input type=range>` + threshold section against a short right column (verdict + compact tripod + driver cards).

**No shared type or spacing scale.** Sizes are ad-hoc inline or Tailwind arbitrary values (`text-[9px]`), re-declared per component.

---

## The unified system

### Chart foundation — Cinematic Instrument

**`ChartShell` (new: `frontend/src/components/charts/ChartShell.tsx`)**
Wraps any recharts chart and provides:
- Header row: title (token typography), optional legend, optional right-aligned control slot (date-range, series toggles, VIX toggle).
- Responsive height presets: `compact` / `standard` / `tall` — replaces hardcoded `height={240}`.
- Opt-in ambient regime glow backdrop (radial gradient keyed to regime color, matching Current State hero treatment).

**Crosshair + readout (consolidates 3 tooltip implementations)**
- Vertical crosshair line snaps to nearest data point on hover.
- Pinned glass readout chip: `background: rgba(12,16,32,0.85)`, `backdropFilter: blur(12px)`, `borderLeft: 3px solid accentColor`, `borderRadius: 8`. Shows date + each series value + units.
- `ChartTooltip.tsx` becomes the single implementation; inline copies in `RegimeChart` and `MiniRegimeChart` deleted.
- **Synced hover** across stacked charts on the same page (History, Event Replay): shared hover-X context object drives all charts simultaneously.

**Hover-to-focus**
- Hovering a series or legend item: hovered series/line stays at full opacity; siblings dim to ~35% via framer-motion `animate`.
- Legend items become toggles (click to show/hide a series).

**Unified regime bands (`<RegimeBands>` + `buildRegimeBands`)**
Consolidate three divergent implementations:
- `RegimeChart.tsx`: SVG `ReferenceArea` per band.
- `MiniRegimeChart.tsx`: CSS gradient overlay.
- `EventReplayChart.tsx`: local `buildBands` util.
→ Single `buildRegimeBands(data)` util (lives in `lib/`) + `<RegimeBands>` renderer that uses `tokens.calmGlow` / `elevatedGlow` / `turbulentGlow` for the subtle per-regime fill.

**`ChartAnnotation` (new: `frontend/src/components/charts/ChartAnnotation.tsx`)**
Pinned marker + glass callout. Data-driven, capped at ~2–3 per chart. Example data shape: `{ date, label, description?, side }`. Not scrollytelling — surgical markers only.

**New capabilities**
- **Brush-to-zoom:** recharts `<Brush>` restyled to dark theme on History's time charts + "reset zoom" affordance.
- **Date-range control:** replaces History's hardcoded `2020-01-01` start. `useHistoricalState` hook gains `{ start, end }` params; backend `/historical-state` endpoint gains `start`/`end` query params.
- **`Scrubber` (new: `frontend/src/components/charts/Scrubber.tsx`):** film-timeline transport (play/pause button + draggable playhead + day counter). Drives animated reveal of a time series. Used by Event Replay; generic and reusable.

**Motion (carry forward, extend)**
- Signature easing `[0.16, 1, 0.3, 1]`, ~0.35s, staggered mounts `delay: i*0.06` — unchanged.
- Charts: draw-on line/area on mount and on data change (stroke-dashoffset animation or recharts `animationDuration`).
- Crosshair and readout updates: instant (no delay/spring — must feel responsive).
- Keep `pulse-{regime}` dominant-flip glow and `AnimatedNumber` from `ProbabilityTripod`.

### Page language

**Glass policy (extend `tokens.ts` comment)**
- Tier 1 glass: page hero (`rgba(12,16,32,0.85)` + blur + inset highlight) and the chart readout chip.
- Tier 2 `Panel`: flat `surface #0c1020`, `1px #151d2e`, `rounded-xl`, soft shadow — all standard content and charts.
- Tier 3 `MetricCard`: `surfaceElevated #0d1525`.
- No glass outside Tier 1 contexts. No random `backdrop-blur` decorating cards.

**Typography scale (add to `tokens.ts`)**
Formalize the recurring patterns:
```ts
typography: {
  microLabel: { fontSize: 9, letterSpacing: '0.10em', textTransform: 'uppercase', color: colors.text3 },
  sectionTitle: { fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' },
  statSm: { fontSize: 22, fontWeight: 800 },
  statMd: { fontSize: 32, fontWeight: 800 },
  statLg: { fontSize: 40, fontWeight: 900 },
  statXl: { fontSize: 52, fontWeight: 900 },
}
```

**Spacing constants (add to `tokens.ts`)**
```ts
spacing: {
  pageX: '1.5rem',   // px-6
  pageY: '1.25rem',  // py-5
  sectionGap: '1.5rem',
  panelPad: '1.25rem',
}
```

---

## Per-page design

### History — `frontend/src/pages/History.tsx`

**Layout**
- Compact **regime-context hero strip** at top: current regime badge + date range in view.
- Below it: a **linked time-chart stack** (RegimeChart + RiskLineChart), sharing a single X-axis domain, one synced crosshair, and one date-range/brush control rendered in a `ChartShell` shared header.
- On lg+: `ChangelogFeed` moves to a **right companion column** (side by side with charts) — eliminates the three-panel tall scroll. On mobile: feed collapses below charts.

**Chart treatment**
- `ChartShell` wrapping both charts with `tall` preset (hero height).
- Synced hover-X context shared between the two stacked charts.
- Regime band glow via `<RegimeBands>`.
- VIX becomes a **legend toggle** in `ChartShell` header — replaces the hand-rolled inline button.
- Hover-to-focus: hovering VIX dims SPY area and vice versa.

**Interaction model**
- Date-range picker + **brush-to-zoom** as the headline new capability; "reset zoom" affordance.
- Click a `ChangelogFeed` entry → pins a `ChartAnnotation` on the chart at that date + highlights the feed entry.
- Legend toggles for VIX and any other series.

**Motion / feedback**
- Draw-on lines on load and on range change.
- Crosshair: instant.
- Annotation callouts: fade + slide in via signature easing.
- Feed entries: staggered mount.

**Surface / card**
- Charts in Tier-2 `Panel`s via `ChartShell`.
- Feed in its own Tier-2 `Panel`.
- Glass only on the readout chip.

**Mobile**
- Charts full-width, still synced.
- Date-range control compact.
- Feed below.
- Brush simplifies to range-select buttons.

---

### Event Replay — `frontend/src/pages/EventReplay.tsx`

**Layout**
- Event selector → **shared segmented control component** (kills the three hand-styled buttons; same component re-used on other pages).
- **Replay stage**: `ChartShell` (tall preset) with `EventReplayChart` inside + `Scrubber` transport directly beneath the chart.
- Stats → a **single coherent row of `MetricCard`s** (fixes the `grid-cols-2` / `grid-cols-3` mismatch). Cards update live at the playhead position.
- Narrative + Takeaway as Tier-2 `Panel`s below.

**Chart treatment**
- `EventReplayChart` rebuilt on `ChartShell` foundation.
- `✕` actual-transition markers → promoted to `ChartAnnotation`s.
- First-crossing `ReferenceLine` → `ChartAnnotation` with label.
- Moving playhead `ReferenceLine` tracks `Scrubber` position.
- Progressive reveal: line/area draws up to playhead; future data dimmed at ~25% opacity.

**Interaction model**
- Play/pause → animates risk rising day-by-day at a readable pace (configurable speed).
- Draggable playhead → jump to any point.
- Hover when paused → crosshair + readout.
- Event switch → stops playback, resets to start of new event.

**Motion / feedback**
- Progressive area/line reveal driven by playhead.
- Regime bands light up as playhead enters each regime.
- Stat card numbers spring via `AnimatedNumber` (`useSpring`).
- Subtle `pulse-{regime}` glow on regime transition crossing.

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
- Keep overall structure; **migrate fully off inline hex onto `tokens.ts` / `Panel`**.
- Hero adopts the shared Tier-1 glass pattern (matching Current State hero — `rgba(12,16,32,0.85)` + regime glow + big risk % right-aligned using `tokens.typography.statXl`).
- Driver columns as proper Tier-2 `Panel`s.
- **Reconcile `ClosestHistoricalSetups` / `AnalogCard`**: replace `bg-white/[0.03]` / `border-white/10` with token equivalents.
- Extract `ReliabilityTable` (currently inline at bottom of `ModelDrivers.tsx`) into `components/ui/ReliabilityTable.tsx`.

**Chart treatment**
- Elevate the push/pull story from plain `DriverBar`s to a **diverging/waterfall contribution chart**: horizontal bars around a center axis — raises-risk bars extend right (red), holds-risk bars extend left (green). Uses token colors. `ChartShell` wrapping with regime glow option.
- Existing `DriverBar`s keep their `barFill` animation for the global-importance ranking list.
- Hover-to-focus on driver bars: hovered bar highlights + glass definition callout appears; others dim.

**Interaction model**
- Hover a driver bar → focus + definition readout.
- Legend / hover-to-focus.
- Reliability accordion stays; restyled with token colors and `Panel`.

**Motion / feedback**
- Staggered `barFill` on both bar types (existing + new diverging).
- Diverging bars animate from the center axis outward on load/data change.
- Hover focus via opacity transition.

**Surface / card**
- Hero: Tier-1 glass.
- Driver sections, analog section, reliability: Tier-2 `Panel`.
- Any stat chips: Tier-3 `MetricCard`.
- Single palette throughout (no Tailwind opacity divergence).

**Mobile**
- Hero stacks: risk % below headline (replace `minWidth:72` + `<br/>` with flex-wrap).
- Two-column driver section → single column.
- Analog cards `grid-cols-1`.
- Diverging chart full-width (stays readable).

---

### Scenario Explorer — `frontend/src/pages/ScenarioExplorer.tsx`

**Layout**
- **lg+:** Two-column Balanced Split.
  - Left (~38%): control panel, compact, scrollable.
  - Right (~62%): **sticky** result column (`position: sticky; top: 1.25rem; max-height: calc(100vh - 5rem); overflow-y: auto`).
  - Right is visually dominant — result area larger/more important.
- **< lg (mobile):** Control Deck stack. Controls rendered first in DOM, output below. `position: sticky` disabled. Preset chips in a horizontal scroll row.

**Control redesign (shrinks left materially)**
Replace bare `<input type=range>` with a compact `ScenarioSlider`:
```
[Label ·●· sensitivity] [value]
━━━━━●━━━━━━━━━━━━━━━━ (thin 4px track, token accent)
[min]               [max]  ← hidden on render, visible on hover
```
Vertical rhythm target: ~48px per slider row vs current ~72px.

Group into collapsible sections via `AnimatePresence`:
- **Presets** (default collapsed once a preset is selected; chip strip)
- **Drivers** (6 factor sliders; default open)
- **Threshold** (1 threshold slider + stats; default collapsed)

**Output enrichment (grows right to match)**
- `ProbabilityTripod` enlarged: bigger numerics (`statXl` for dominant, `statLg` for others), wider tiles, stronger dominant-tile glow.
- Driver cards flow in a **2-col grid** beneath the tripod (instead of single-column) to fill vertical space.
- Verdict text block uses token typography (not inline sizes).

**Interaction model**
- Dragging any slider → immediate update to sticky verdict + tripod (no spinner; the 6ms backend latency makes this instant).
- Sensitivity dots communicate impact before you drag.
- Collapsible sections animate; section headers show summary state when collapsed (e.g. "Threshold: 0.42 · 3 crises caught").

**Motion / feedback**
- Keep `AnimatedNumber` spring + `pulse-{regime}` dominant-flip glow.
- Collapsible sections: `AnimatePresence` slide.
- Sticky panel has CSS `transform: translateZ(0)` to avoid repaint jank.

**Surface / card**
- Controls: Tier-2 `Panel` (one panel or grouped panels).
- Result: Tier-2 `Panel` wrapper; tripod tiles stay as-is (their own glass-like border on dominant tile is already correct).
- Driver cards: Tier-2.

**Mobile**
- Controls: preset chip row (horizontal scroll) + compact driver sliders stacked + threshold collapsed by default.
- Output: full-width below.
- Sticky disabled.
- Tripod full-width.

---

## Cross-cutting refactors (enablers, do before page work)

| Item | Files affected |
|------|----------------|
| Consolidate tooltip | Delete inline tooltips in `RegimeChart.tsx`, `MiniRegimeChart.tsx`; `ChartTooltip.tsx` becomes the single source |
| Token adoption in charts | All `charts/*.tsx` — replace hardcoded hex with `colors.cyan`, `colors.green`, etc. |
| Typography + spacing scale | `lib/tokens.ts` — add `typography` and `spacing` objects |
| `buildRegimeBands` unification | `lib/regimeBands.ts` (new); remove local implementations from 3 chart files |
| AnalogCard palette reconciliation | `components/AnalogCard.tsx`, `components/ClosestHistoricalSetups.tsx` |
| Extract `ReliabilityTable` | `components/ui/ReliabilityTable.tsx` (new) |

---

## Verification

1. `cd frontend && npm run dev` — walk each page at desktop (1280+), tablet (768–1024), mobile (<768).
2. **History:** synced crosshair, brush-zoom + date-range (backend param), feed annotation linking.
3. **Event Replay:** play button animates, stat cards update at playhead, scrubber is draggable.
4. **Signal Breakdown:** one palette (no `bg-white/[0.03]`), diverging chart animates from center, hover-to-focus.
5. **Scenario Explorer:** sticky output visible while dragging sliders on desktop; mobile stack order correct; no layout shift on slider drag.
6. `grep -r '#06b6d4\|#4ade80\|#fbbf24\|#f87171' frontend/src/components/charts` → zero results (tokens used).
7. Confirm only one `ChartTooltip` component exists.
8. Run test suite; confirm 118+ tests pass.
9. Use `playwright-skill` to screenshot each page and validate interactions programmatically.

---

## Open questions

1. **Signal Breakdown waterfall chart:** diverging/waterfall > simple bars for the push/pull story — confirm appetite before implementation.
2. **History feed ↔ annotation linking:** click a changelog entry to pin a chart annotation — is this v1 or a follow-up? Low build cost, high UX payoff.
3. **Backend scope for Event Replay scrubber:** current data returned by `/event-replay/{name}` is complete; the scrubber can operate client-side (slice array up to playhead). No backend changes needed unless we want more events or richer annotation metadata.
