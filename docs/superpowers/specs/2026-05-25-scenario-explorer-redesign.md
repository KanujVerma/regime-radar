# Scenario Explorer Redesign — Design Spec

## Goal

Fix two user-reported problems with the Scenario Explorer left column: (1) only one section can be open at a time (accordion single-expand constraint), and (2) sliders are too large. The redesign also introduces a "customized from preset" state so users always know when they've diverged from a named scenario.

## Context

Current state: `frontend/src/pages/ScenarioExplorer.tsx` uses a `SectionHeader` component and `openSection` state (`'presets' | 'drivers' | 'threshold'`) that enforces single-open accordion. `ScenarioSlider.tsx` renders a `padding: '4px 0'` row that is taller than needed on desktop.

The right column and result area (ProbabilityTripod, driver cards, verdict block) are **out of scope** — no changes there.

---

## Layout: D Hybrid

**Structure (left column, top to bottom):**
1. **Preset chip strip** — always visible, never collapsible
2. **Customized indicator row** — appears only when sliders diverge from active preset
3. **Divider**
4. **Drivers section** — single collapsible section, no other section competes with it
5. **Divider**
6. **Alert Threshold section** — always visible, mirrors driver row semantics

**What changes from current:**
- Replace `openSection` state (single-open) with a single `driversOpen` boolean
- Preset section header removed — chips are always visible, no toggle needed
- Threshold section header removed — it is always visible as a named control row

---

## Chip State System

Four explicit visual states for preset chips. All transitions: `120ms ease`.

### State 1 — Inactive
```
background:  #0a0f1c
border:      1px solid #1e2a3a
border-radius: 14px
padding:     4px 12px
font-size:   11px
color:       #64748b
font-weight: 400
```

### State 2 — Inactive, hover
```
background:  #0d1526
border:      1px solid #3a5070    ← wider contrast gap vs inactive
color:       #94a3b8
```
Transition on `background`, `border-color`, `color`.

### State 3 — Active, untouched (preset values exactly match sliders)
```
background:  #0d1a30
border:      2px solid #3b82f6
color:       #93c5fd
font-weight: 600
```
No ✦ badge. Clean selection state.

### State 4 — Active, modified (sliders have diverged from preset values)
```
background:  #080c18
border:      1.5px dashed #3a5070
color:       #6a80a0             ← slightly lighter than inactive; still reads as "selected"
font-weight: 500
label:       "{icon} {name} ✦"  ← ✦ (U+2726) appended inline, color #3b6fa8
```
The chip must still read as "I own this preset as my starting point," not "this is abandoned." The dashed border and ✦ signal divergence without fully deactivating the chip.

**Logic for State 3 vs State 4:**
- Track `activePresetId: string | null` — set when a preset chip is clicked
- Compare current `inputs` against `PRESETS[activePresetId]` for each key in `SLIDER_KEYS_FOR_SENSITIVITY`
- If any key differs by more than its `step` value: State 4. Otherwise: State 3.
- On reset: restore inputs to `PRESETS[activePresetId]`, return to State 3
- On a different preset click: new `activePresetId`, clear customized state

---

## Customized Indicator Row

Renders only when `activePresetId != null` and chip is in State 4.

```
font-size:   10px
color:       #2d4a6a
layout:      flex row, gap 6px, align-items center
```

Contents:
```
✦ Modified from "{presetLabel}" ·  [↺ reset]
```

The reset affordance is a pill button (not plain text link):
```
background:  #0d1a30
border:      1px solid #2a3d5c
border-radius: 8px
padding:     2px 8px
font-size:   10px
color:       #60a5fa
font-weight: 600
cursor:      pointer
```

On click: `setInputs(PRESETS[activePresetId])` — returns chip to State 3, hides this row.

This row replaces the existing global "↺ Reset to current market" topbar button for the preset-divergence use case. The topbar reset button stays as-is (resets to live market baseline, a separate concept).

---

## Drivers Section

### Collapse behavior
- Controlled by `driversOpen: boolean` state
- **Initial value logic (evaluated once on mount):**
  1. If `localStorage.getItem('scenario-drivers-open')` is not null → use stored value (`=== 'true'`)
  2. Otherwise → `window.innerWidth >= 1024` (open on desktop, collapsed on mobile)
- Persisted on every toggle: `localStorage.setItem('scenario-drivers-open', String(newValue))`
- localStorage takes precedence over viewport default on all subsequent visits

### Section header
```
display:      flex, justify-content space-between, align-items center
margin-bottom: 8px (when open)
cursor:        pointer
```
Label: `font-size: 12px, font-weight: 600, color: #94a3b8`  
Toggle: SVG chevron `▾`/`▸`, 12×12px, color `#334155`. No text label ("hide" / "show" removed).

Collapse animation: `AnimatePresence` with `height: 0 → auto, opacity: 0 → 1, duration: 0.2s`.

### Driver rows (ScenarioSlider update)

Update `ScenarioSlider.tsx` to reduce vertical footprint:

```
outer padding:  2px 0   (down from 4px 0)
row gap:        7px between sliders (set in parent, not in component)
label font:     11px (unchanged)
value font:     11px font-weight 700 (unchanged)
track height:   3px (down from 4px via input height)
label-to-track margin: 3px (down from current)
```

The sensitivity dot (6×6px colored circle before the label) is retained as-is.

### Changed-from-preset slider state

When chip is in State 4 (active modified) and a specific slider's value differs from `PRESETS[activePresetId][key]`:

- **Value display:** `color: #60a5fa` (accent blue) instead of `#94a3b8`
- **Preset annotation:** append `" (preset: {presetValue})"` in `font-size: 9px, color: #2d4a6a` next to the value
- **Track:** render two fills — a dim `#1e3a5c` fill up to the preset position, then a bright `#3b82f6` fill from preset to current position. If current < preset, the bright fill is to the left of the dim.

When chip returns to State 3 (reset or matching): all slider values revert to normal styling.

---

## Alert Threshold Section

Always visible. Matches driver row semantics exactly:

```
Section micro-label: "Alert Threshold"
  font-size:      9px
  text-transform: uppercase
  letter-spacing: 0.1em
  color:          #334155
  margin-bottom:  8px

Control row:
  label:          "Alert at"   font-size 11px, color #64748b
  value:          "{n}%"       font-size 11px, font-weight 700, color #fbbf24
  track:          3px height, background #1e2a3a, fill #fbbf24, fill-width = (threshold - min) / (max - min) * 100%

Track is a styled div (not native range input for visual consistency)
The interactive range input (<input type="range">) overlays the styled track (absolute positioned, opacity 0, full width)
```

This section is not collapsible.

**Future consideration (out of scope for this spec):** When the threshold differs from the user's last-saved baseline threshold, show the same `(baseline: X%)` annotation pattern as driver rows. Not implemented now.

---

## State / Props Changes in `ScenarioExplorer.tsx`

**Remove:**
- `openSection: 'presets' | 'drivers' | 'threshold'` state
- `SectionHeader` component (inline function)
- `AnimatePresence` blocks for preset and threshold sections

**Add:**
- `activePresetId: string | null` state (replaces implicit "which preset is selected" tracking)
- `driversOpen: boolean` state with localStorage init
- `isCustomized: boolean` derived value — `activePresetId != null` and at least one slider key differs from `PRESETS[activePresetId]`

**Preset click handler update:**
```typescript
onClick={() => {
  setInputs(PRESETS[p.id])
  setActivePresetId(p.id)
  showBanner(...)
}}
```

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/pages/ScenarioExplorer.tsx` | Replace accordion logic with `driversOpen` + `activePresetId`; restructure left column JSX |
| `frontend/src/components/ui/ScenarioSlider.tsx` | Tighter row padding, add `presetValue?: number` prop for changed-from-preset rendering |

No new files needed. No backend changes.

---

## Out of Scope

- Right column (ProbabilityTripod, driver cards, verdict) — unchanged
- Threshold "changed from baseline" annotation — future consideration
- Mobile layout beyond collapse-by-default — unchanged
- New presets or preset content — unchanged
