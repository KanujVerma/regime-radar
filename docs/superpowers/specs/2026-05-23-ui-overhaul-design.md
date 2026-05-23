# UI Overhaul Design Spec
**Date:** 2026-05-23  
**Status:** Approved — ready for implementation planning

---

## Direction Summary

**Base:** C (Editorial Hero) — the app is a live intelligence brief, not a card dashboard. The regime reading dominates visually on every page.

**Polish layer:** A (Refined Glass) — glass surfaces, premium spacing, smooth microinteractions, commercial SaaS feel.

**Technical sections:** Selective B (Terminal Dense) — Signal Breakdown, threshold tables, historical analogs use sharper, denser treatment. Still refined, never cramped.

**Not:** a generic glassmorphism clone. Not a Bloomberg terminal. A polished commercial webapp that feels credible and serious.

---

## 1. Design System

### Color Tokens

Keep all existing tokens in `src/lib/tokens.ts` unchanged. Add:

```ts
// New additions only
surfaceElevated: '#0d1525',          // hover / active card state
glass: 'rgba(12,16,32,0.85)',        // hero panel backgrounds
glassHighlight: 'inset 0 1px 0 rgba(255,255,255,0.05)',  // top-edge highlight

// Per-regime ambient glow — hero areas only, one per page
calmGlow:      'rgba(74,222,128,0.10)',
elevatedGlow:  'rgba(251,191,36,0.10)',
turbulentGlow: 'rgba(248,113,113,0.10)',
```

No new hues. Every color derives from existing green / amber / red / cyan / slate palette.

### Typography Scale

Replace the current ad-hoc inline font sizes (9–11px everywhere) with a consistent scale. Define as Tailwind utilities or as named CSS variables — either is fine as long as it's consistent:

| Role | Size | Weight | Usage |
|---|---|---|---|
| Label | 10px, uppercase, tracking-widest | 700 | Section headers, metric labels |
| Meta | `text-xs` (12px) | 400 | Timestamps, subtitles |
| Body | `text-sm` (14px) | 400 | Narrative paragraphs |
| UI | `text-base` (16px) | 500 | Card values, button text |
| Metric | `text-2xl`–`text-3xl` | 800 | VIX, risk %, secondary metrics |
| Hero | `text-5xl` | 900 (font-black) | Regime label on Current State, page hero number |

Minimum readable size anywhere in the app: `text-xs` (12px). The current 9px table text in Signal Breakdown must be bumped to at least `text-xs`.

### Surface Language — Three Tiers

**Tier 1 — Glass** (hero panels, one per page):
- `background: rgba(12,16,32,0.85)`
- `backdrop-filter: blur(12px)`
- `box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 32px rgba(0,0,0,0.5)`
- Border: `1px solid rgba({regimeColor},0.15)` — adapts to current regime
- Used exactly once per page for the primary hero block

**Tier 2 — Elevated** (`#0d1525`):
- Secondary metric tiles, hover state for tier-3 cards
- Border: `1px solid #1a2540`
- `box-shadow: 0 2px 16px rgba(0,0,0,0.3)`

**Tier 3 — Panel** (`#0c1020`):
- Standard content panels — unchanged from current
- Border: `#151d2e`

### Spacing

- Page padding: `px-6` desktop, `px-4` mobile (currently `px-5` mixed)
- Card internal padding: normalize to `20px horizontal / 16px vertical`
- Section gap between major blocks: `space-y-6` (currently inconsistent)
- Touch target minimum on all interactive elements: `44px` height

---

## 2. Layout Changes Per Page

### Current State — Major Redesign

Replace the 3-equal-weight MetricCard grid with an editorial hero layout:

**Hero block (Tier 1 Glass surface):**
- Regime name: `text-5xl font-black` with radial regime-color ambient glow behind it
- "● LIVE · {date}" indicator: 10px uppercase, regime color, with `@keyframes ping` pulse dot
- Narrative paragraph: `text-sm` (14px), directly below the name — no more buried placement
- Right side: transition risk number (`text-3xl font-black`) with risk color, plus reliability context inline

**Secondary metric row** (Tier 2 surface, below hero):
- VIX, Trend as smaller chips — visually subordinate to regime, not equal
- These shrink to a compact row on mobile

**Transition risk section** (separate block below):
- Glowing horizontal gauge bar: `height: 5px`, gradient fill, `box-shadow: 0 0 8px {color}40`
- Reliability text alongside it (unchanged in content, improved in hierarchy)

**Chart:** Expands to full-width cinematic area chart (see Section 3)

**DailyDiff block:** Refined with slide-in stagger per item (see Section 4)

### History — Moderate Upgrade

- Regime chart takes more vertical space (`height: 280px` → `360px`)
- Notable Days changelog redesigned as proper vertical timeline: thin connector line + event nodes with date + entry text, not a flat list

### Signal Breakdown (ModelDrivers) — B-Style Treatment

- Hero row (regime + risk reading): tighter, sharper — analytical feel
- Driver bars: animated left-to-right fill on mount, staggered by index
- Typography bumped to `text-xs` minimum throughout — no more 9px
- Reliability accordion: AnimatePresence expand/collapse (see Section 4)
- Closest Historical Setups: glass tier-1 card treatment

### Scenario Explorer — Polish Pass

- ProbabilityTripod: regime glow on dominant tile, larger probability numbers (`text-2xl`)
- Sliders: Radix thumb/track styled to match design system (no default browser styling)
- Full input-responsive ripple behavior (see Section 4)

### Event Replay — Light Pass

- Chart gets area fill treatment
- Consistent spacing/typography pass

---

## 3. Charts

### Hero Charts (Current State, History)

Replace `LineChart` with `AreaChart`. Changes:

**Area fill:**
- Gradient from regime color at 25% opacity to transparent over chart height
- Updates when regime changes (color transition matches current regime)

**Grid:**
- Remove `CartesianGrid` entirely OR replace with single faint horizontal lines only (`stroke: #0f1929`, no vertical lines)

**Line:**
- `strokeWidth: 2.5` (from 2)
- Animated draw on mount: `strokeDashoffset` from full path length to 0 over `0.8s ease-out`
- Implement via CSS: set `stroke-dasharray` and `stroke-dashoffset` equal to the path's `getTotalLength()` on mount, then transition `stroke-dashoffset` to 0 via a CSS animation class applied after mount

**Tooltip (custom component):**
- Replace default Recharts tooltip box
- Dark glass card: `background: rgba(8,11,24,0.95)`, `border: 1px solid #1e3a5f`, `border-radius: 8px`, `padding: 10px 14px`
- Left accent border: `3px solid {regimeColor}` for the currently-hovered point's regime
- Content: date at `text-xs` color `#94a3b8`, value at `text-sm font-bold` color white
- `pointer-events: none`, positioned via Recharts `position: { x, y }` prop

**Active dot (custom):**
- `r: 5`, fill: `{regimeColor}`, `stroke: rgba({regimeColor},0.3)`, `strokeWidth: 8`
- Creates a soft halo effect on hover

**Reference lines:**
- Remove the current inline Recharts `label` prop (it clips and overlaps)
- Replace with floating annotation badges positioned absolutely above the chart container
- Badge: `text-[9px] font-bold uppercase px-2 py-0.5 rounded`, matching color per threshold

**Regime bands (RegimeChart):**
- On hover, increase the hovered `ReferenceArea` fill opacity from `0.2` to `0.4`
- Show a small tooltip with regime name + date range on band hover

### Technical Charts (Signal Breakdown, Scenario)

**Driver bars:**
- `width: 0 → value` transition on mount: `transition: width 350ms ease-out`, staggered by `index * 40ms` via `transition-delay`
- Color coding unchanged (positive SHAP = amber/red gradient, calming = green/cyan)

**Probability tiles (Scenario):**
- Numbers use framer-motion `animate` value with spring config `{ stiffness: 200, damping: 20 }` so they interpolate smoothly as sliders move
- Dominant tile detection drives glow + border state (see Section 4)

**Threshold / reliability tables:**
- Typography pass: `text-xs` minimum everywhere
- Horizontal rules: `#151d2e` (unchanged)
- No structural changes to the table layout

---

## 4. Motion & Interaction Feedback

Two distinct layers — both are required.

### Layer 1: Entrance Polish

| Pattern | Spec |
|---|---|
| Page mount | `opacity: 0→1, y: 8→0`, `duration: 0.35s`, easing `[0.16, 1, 0.3, 1]` |
| Card stagger | `delay: index * 0.05s` — keep existing `cardVariants` shape |
| Chart line draw | `strokeDashoffset` on mount, `0.8s ease-out` |
| Count-up | Risk % + VIX animate from 0 on **first mount only** — not on refresh |
| Skeleton screens | Pulsing placeholder blocks (`animate-pulse`, bg `#0d1525`) for every page loading state — replaces bare "Loading…" text |
| Live regime dot | CSS `@keyframes ping` on the ● indicator in Current State hero |

### Layer 2: Interaction Feedback

#### Scenario sliders — real-time response

**Module ripple (runs on every slider input event):**
- Affected modules (risk gauge, driver bars): class-toggle `.lit` approach
- `.lit` applied: `transition: background-color 80ms ease-in, border-color 80ms ease-in` → `background: rgba(6,182,212,0.10)`, `border-color: rgba(6,182,212,0.38)`
- `.lit` removed after 120ms: default transitions (`450ms ease-out`) handle the slow fade back
- Effect: border snaps in fast, both border + background fade out slowly — unmistakably responsive without being loud

**Smooth number transitions (runs continuously while dragging):**
- Probability tile percentages: framer-motion `animate` with spring `{ stiffness: 200, damping: 20 }`
- Risk gauge fill width: CSS `transition: width 280ms ease-out`
- Driver bar widths: CSS `transition: width 280ms ease-out`

**Dominant tile state:**
- Border + glow controlled by `.dominant` class — CSS `transition: border-color 300ms ease-out, box-shadow 300ms ease-out`
- On dominance flip: new dominant tile fires a glow pulse animation (`box-shadow` keyframe, `380ms ease-out`)

**Narrative text:**
- Updates to match new dominant regime
- Left border accent transitions: CSS `transition: border-left-color 300ms ease-out`

#### Meaningful state change banners

Banners appear **only** for these events. All other slider motion produces no badge.

| Trigger | Banner text | Color |
|---|---|---|
| Dominant regime flips | "Dominant regime: {from} → {to}" | New regime color |
| Risk crosses 20% upward | "⚠ Crossed watch threshold (20%)" | Amber |
| Risk crosses 40% upward | "⚠ Crossed alert threshold (40%)" | Red |
| Risk drops below 20% | "✓ Back below watch threshold" | Green |
| Scenario reset applied | "↺ Reset to baseline" | Cyan |
| Preset scenario applied | "{Preset name} applied" | Cyan |

**Edge-trigger + cooldown rule:** Each banner has a per-ID cooldown of **250ms minimum** between fires. If the user scrubs back and forth across a threshold boundary, the banner fires once, then is suppressed for 250ms before it can fire again for the same banner ID. This prevents flicker-on-boundary without requiring debounce on the slider itself.

Implementation: track `lastFiredAt[bannerId]` timestamp. Before showing a banner, check `Date.now() - lastFiredAt[bannerId] > 250`. If not, skip.

#### Other interaction feedback

| Pattern | Spec |
|---|---|
| Expand/collapse (reliability accordion, any future collapsible) | `AnimatePresence` + `motion.div`: `initial={{ height: 0, opacity: 0 }}` → `animate={{ height: 'auto', opacity: 1 }}`, `overflow: hidden`. Arrow rotates `0→90deg` with `transition: transform 150ms` |
| Hover lift (cards) | `transition: transform 150ms ease-out, box-shadow 150ms ease-out`. Hover: `translateY(-2px)`, shadow grows |
| Press feedback (all clickable elements) | Tailwind `active:scale-[0.98]` |
| Refresh button loading state | Icon rotates via CSS `animation: spin 0.8s linear infinite` while `loading === true`. Button `disabled` + `opacity-50` + `cursor-not-allowed` during load |
| VIX toggle (History) | Radix switch with `motion.div` background transition `150ms ease-out` |
| Value-change flash (on data refresh) | Numbers that changed vs previous fetch: `400ms` flash `rgba(251,191,36,0.15) → transparent`. Gated on `prevValue !== newValue` via `useRef` — does not fire on every render |
| DailyDiff items | Slide in from left on mount, staggered `40ms` per item |

**What does NOT animate:**
- Data on background refresh (numbers snap to new value; only initial mount counts-up)
- Regime/color on hero when refreshing (not a real-time signal; would be jarring)
- Sidebar navigation
- Charts on window resize

---

## 5. Navigation & Mobile

### Breakpoints

| Range | Navigation |
|---|---|
| `lg+` (≥1024px) | Existing 196px left sidebar — unchanged |
| `<lg` (<1024px) | Fixed 60px bottom navigation bar |

No icon-rail intermediate state. The sidebar hides entirely below `lg`, replaced by the bottom nav.

### AppShell Changes

```tsx
// Before
<main style={{ marginLeft: 196, minHeight: '100vh', overflowX: 'hidden' }}>

// After
<main className="lg:ml-[196px] ml-0 pb-[60px] lg:pb-0 min-h-screen overflow-x-hidden">
```

### Bottom Navigation Bar

- Fixed, `bottom: 0`, full width, `height: 60px`
- Background: `#0a0d16` (sidebar color), `border-top: 1px solid #151d2e`
- 5 items: Current State, History, Event Replay, Signal Breakdown, Scenario
- Each item: icon (24px) + label (9px, uppercase) stacked vertically, centered
- Active state: thin `2px` colored top accent line (cyan) + icon + label in `#f1f5f9`, inactive in `#4a6080`
- Safe area inset: `padding-bottom: env(safe-area-inset-bottom)` for iPhone notch

### Per-Page Mobile Adaptations

| Component | Desktop | Mobile |
|---|---|---|
| Current State hero cards | `grid-cols-3` | `grid-cols-1`, regime hero full-width first |
| Charts | `height: 200px` | `height: 240–260px` (taller = easier to read trend) |
| Driver bars | 2-col | full-width stack |
| Analog cards | `sm:grid-cols-3` | `grid-cols-1` |
| Scenario sliders | inline with labels | full-width stack, label above |
| Topbar subtitle | visible | hidden on `<sm` (title only) |
| Reliability table | full | horizontally scrollable on mobile |

---

## 6. Restraint — What Stays Controlled

- **Glass blur:** Tier 1 surfaces only — one per page. Not every card.
- **Regime glow:** Hero area per page only — one radial ambient glow max per screen.
- **No new colors:** Every color derives from existing token set. Zero new hues.
- **Animation gates:** Mount-only for entrance animations. Interaction feedback only on user-initiated events. No background-refresh-triggered animations.
- **Recharts stays:** No D3 replacement. Area fill + custom tooltip + animated draw is enough.
- **Border radius:** `8–12px` throughout. No extreme rounding, no pill cards.
- **Type sizes:** Max 3 distinct sizes visible in any single content section.
- **No decorative elements:** No particle effects, background canvas, floating shapes, or carousels.
- **Skeleton duration:** Loading skeletons should resolve quickly (API is fast). If a skeleton persists >3s, show an error state — don't leave the user staring at a shimmer indefinitely.

---

## Implementation Notes

- **`tokens.ts`:** Add new surface/glow tokens here. All components import from this file — no new hardcoded hex values in component files.
- **Custom tooltip:** Build as a shared `<ChartTooltip>` component in `components/charts/` — all charts use it.
- **Bottom nav:** New `BottomNav.tsx` component in `components/layout/`. AppShell conditionally renders `<Sidebar>` (lg+) or `<BottomNav>` (<lg) via Tailwind responsive classes or a `useBreakpoint` hook.
- **Skeleton screens:** Build a generic `<SkeletonBlock width height className?>` component in `components/ui/`. Each page composes the skeleton it needs from these blocks — no per-page skeleton component required.
- **Banner system:** Encapsulate the edge-trigger + cooldown logic in a `useStateBanners()` hook in Scenario Explorer. Banner state is local to the page — not global.
- **framer-motion spring for numbers:** Use `useSpring` + `useTransform` for probability tile values that need to animate continuously during drag.
