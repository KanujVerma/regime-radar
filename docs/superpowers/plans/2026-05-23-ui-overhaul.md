# UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the regime-radar frontend into a polished commercial webapp with an editorial hero layout, refined glass surface system, animated charts, interaction feedback, and full mobile support.

**Architecture:** Phase 1 establishes token/CSS foundation and shared components. Phase 2 rewires navigation for mobile. Phases 3-4 apply the new design to pages and charts. Phase 5 adds interaction feedback (scenario ripple, accordions). Phase 6 polishes remaining pages and applies mobile grid adaptations. Each phase leaves the app in a working, deployable state.

**Tech Stack:** React 18, TypeScript, Tailwind v4, Framer Motion v12, Recharts v3, Lucide React, Radix UI, React Router v7, Vite, Vitest, Playwright

**Verification commands used throughout:**
- Build check: `cd /Users/kanuj/regime-radar/frontend && npm run build` — expect `✓ built in X.XXs` (the 500KB+ minification warning is known and non-blocking)
- Unit tests: `cd /Users/kanuj/regime-radar/frontend && npm test`
- Smoke tests require dev server + API backend running simultaneously (use for final verification only)

---

## Phase 1 — Foundation

### Task 1: Extend Design Tokens + Add Animation Utilities

**Files:**
- Modify: `frontend/src/lib/tokens.ts`
- Modify: `frontend/tailwind.config.ts`
- Modify: `frontend/src/App.css`

- [ ] **Step 1: Add new tokens to `frontend/src/lib/tokens.ts`**

  Replace the entire file with:

  ```ts
  export const colors = {
    bg: '#080b12',
    surface: '#0c1020',
    surfaceElevated: '#0d1525',
    sidebar: '#0a0d16',
    border: '#151d2e',
    borderSubtle: '#131b2a',
    borderElevated: '#1a2540',
    cyan: '#06b6d4',
    cyanDim: '#0e4d6e',
    green: '#4ade80',
    greenDim: '#166534',
    amber: '#fbbf24',
    amberDim: '#92400e',
    red: '#f87171',
    redDim: '#7f1d1d',
    textPrimary: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    textDim: '#4a6080',
    // Glass surfaces — Tier 1 hero panels only
    glass: 'rgba(12,16,32,0.85)',
    glassHighlight: 'inset 0 1px 0 rgba(255,255,255,0.05)',
    // Per-regime ambient glow (used as radial-gradient color, one per page)
    calmGlow: 'rgba(74,222,128,0.10)',
    elevatedGlow: 'rgba(251,191,36,0.10)',
    turbulentGlow: 'rgba(248,113,113,0.10)',
  } as const

  export const regimeColor: Record<string, string> = {
    calm: colors.green,
    elevated: colors.amber,
    turbulent: colors.red,
    unknown: colors.textMuted,
  }

  export const regimeGlow: Record<string, string> = {
    calm: colors.calmGlow,
    elevated: colors.elevatedGlow,
    turbulent: colors.turbulentGlow,
    unknown: 'transparent',
  }

  /** Returns an rgba border color at ~15% opacity from a hex color */
  export function regimeBorder(hexColor: string): string {
    return `${hexColor}26`
  }
  ```

- [ ] **Step 2: Add `surfaceElevated` and `borderElevated` to Tailwind config**

  Open `frontend/tailwind.config.ts`. In `theme.extend.colors`, add:

  ```ts
  surfaceElevated: '#0d1525',
  borderElevated: '#1a2540',
  ```

  The full `colors` block should now read:
  ```ts
  colors: {
    bg: '#080b12',
    surface: '#0c1020',
    surfaceElevated: '#0d1525',
    sidebar: '#0a0d16',
    border: '#151d2e',
    borderElevated: '#1a2540',
    cyan: '#06b6d4',
    'cyan-dim': '#0e4d6e',
  },
  ```

- [ ] **Step 3: Add animation utilities to `frontend/src/App.css`**

  Replace the entire `App.css` with:

  ```css
  /* ── Live dot pulse ── */
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(1.6); }
  }
  .live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  /* ── Module ripple — fast snap in, slow fade out ── */
  .module-base {
    transition: background-color 450ms ease-out, border-color 450ms ease-out;
  }
  .module-base.module-lit {
    background-color: rgba(6,182,212,0.10) !important;
    border-color: rgba(6,182,212,0.38) !important;
    transition: background-color 80ms ease-in, border-color 80ms ease-in;
  }

  /* ── Hover lift for cards ── */
  .card-hover {
    transition: transform 150ms ease-out, box-shadow 150ms ease-out;
    cursor: default;
  }
  .card-hover:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(0,0,0,0.4);
  }

  /* ── Press feedback for all buttons ── */
  button:active, [role="button"]:active {
    transform: scale(0.98);
  }

  /* ── Refresh spinner ── */
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .spin {
    animation: spin 0.8s linear infinite;
    display: inline-block;
  }

  /* ── Skeleton pulse ── */
  @keyframes skeleton-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.5; }
  }
  .skeleton-pulse {
    animation: skeleton-pulse 1.4s ease-in-out infinite;
    background: #0d1525;
    border-radius: 6px;
  }
  ```

- [ ] **Step 4: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/lib/tokens.ts frontend/tailwind.config.ts frontend/src/App.css
  git commit -m "feat(ui): extend design tokens and add animation CSS utilities"
  ```

---

### Task 2: Create Shared Foundation Components

**Files:**
- Create: `frontend/src/components/ui/SkeletonBlock.tsx`
- Create: `frontend/src/components/charts/ChartTooltip.tsx`

- [ ] **Step 1: Create `SkeletonBlock`**

  ```tsx
  // frontend/src/components/ui/SkeletonBlock.tsx
  interface SkeletonBlockProps {
    width?: string
    height?: string
    className?: string
    rounded?: number
  }

  export default function SkeletonBlock({
    width = '100%',
    height = '16px',
    className = '',
    rounded = 6,
  }: SkeletonBlockProps) {
    return (
      <div
        className={`skeleton-pulse ${className}`}
        style={{ width, height, borderRadius: rounded }}
      />
    )
  }
  ```

- [ ] **Step 2: Create `ChartTooltip`**

  This shared component replaces the default Recharts tooltip on all charts.

  ```tsx
  // frontend/src/components/charts/ChartTooltip.tsx
  interface ChartTooltipProps {
    active?: boolean
    payload?: Array<{ value: number | null; name?: string }>
    label?: string
    accentColor?: string
    formatter?: (value: number) => string
    labelFormatter?: (label: string) => string
  }

  export default function ChartTooltip({
    active,
    payload,
    label,
    accentColor = '#06b6d4',
    formatter,
    labelFormatter,
  }: ChartTooltipProps) {
    if (!active || !payload?.length) return null
    const raw = payload[0]?.value
    if (raw == null) return null
    const displayValue = formatter ? formatter(raw) : String(raw)
    const displayLabel = labelFormatter ? labelFormatter(label ?? '') : (label ?? '')

    return (
      <div
        style={{
          background: 'rgba(8,11,24,0.97)',
          border: '1px solid #1e3a5f',
          borderLeft: `3px solid ${accentColor}`,
          borderRadius: 8,
          padding: '10px 14px',
          pointerEvents: 'none',
          minWidth: 120,
        }}
      >
        {displayLabel && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{displayLabel}</div>
        )}
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{displayValue}</div>
      </div>
    )
  }
  ```

- [ ] **Step 3: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/components/ui/SkeletonBlock.tsx frontend/src/components/charts/ChartTooltip.tsx
  git commit -m "feat(ui): add SkeletonBlock and ChartTooltip shared components"
  ```

---

### Task 3: StateBanner Component + useStateBanners Hook + Unit Tests

**Files:**
- Create: `frontend/src/components/ui/StateBanner.tsx`
- Create: `frontend/src/hooks/useStateBanners.ts`
- Create: `frontend/src/hooks/useStateBanners.test.ts`

- [ ] **Step 1: Write the failing test**

  ```ts
  // frontend/src/hooks/useStateBanners.test.ts
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { canShowBanner, COOLDOWN_MS } from './useStateBanners'

  describe('canShowBanner', () => {
    let lastFiredAt: Record<string, number>

    beforeEach(() => {
      lastFiredAt = {}
    })

    it('allows banner when no active banner and no prior fire', () => {
      expect(canShowBanner('watch', 3, Infinity, lastFiredAt, Date.now())).toBe(true)
    })

    it('blocks banner fired within cooldown window', () => {
      const now = Date.now()
      lastFiredAt['watch'] = now - (COOLDOWN_MS - 50)
      expect(canShowBanner('watch', 3, Infinity, lastFiredAt, now)).toBe(false)
    })

    it('allows banner after cooldown has expired', () => {
      const now = Date.now()
      lastFiredAt['watch'] = now - (COOLDOWN_MS + 10)
      expect(canShowBanner('watch', 3, Infinity, lastFiredAt, now)).toBe(true)
    })

    it('blocks lower-priority banner when higher-priority is active', () => {
      expect(canShowBanner('watch', 3, 1, lastFiredAt, Date.now())).toBe(false)
    })

    it('allows higher-priority banner to replace lower-priority active banner', () => {
      expect(canShowBanner('flip', 1, 3, lastFiredAt, Date.now())).toBe(true)
    })

    it('allows equal-priority banner when different id (independent cooldowns)', () => {
      const now = Date.now()
      lastFiredAt['alert'] = now - (COOLDOWN_MS + 10)
      expect(canShowBanner('alert', 2, Infinity, lastFiredAt, now)).toBe(true)
    })
  })
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|Error|canShowBanner"
  ```

  Expected: `Error: Failed to resolve import` or similar — `useStateBanners` does not exist yet.

- [ ] **Step 3: Implement `useStateBanners.ts`**

  ```ts
  // frontend/src/hooks/useStateBanners.ts
  import { useState, useCallback, useRef } from 'react'

  export const COOLDOWN_MS = 250
  const AUTO_DISMISS_MS = 2200

  export interface BannerState {
    id: string
    text: string
    color: string
    priority: number
  }

  /**
   * Pure function — extracted for unit testing.
   * Returns true if the banner should be shown given current system state.
   */
  export function canShowBanner(
    bannerId: string,
    incomingPriority: number,
    currentPriority: number,
    lastFiredAt: Record<string, number>,
    now: number,
  ): boolean {
    const lastFired = lastFiredAt[bannerId] ?? 0
    if (now - lastFired < COOLDOWN_MS) return false
    if (incomingPriority >= currentPriority) return false
    return true
  }

  export function useStateBanners() {
    const [activeBanner, setActiveBanner] = useState<BannerState | null>(null)
    const lastFiredAt = useRef<Record<string, number>>({})
    const currentPriority = useRef<number>(Infinity)
    const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const showBanner = useCallback((banner: BannerState) => {
      const now = Date.now()
      if (!canShowBanner(banner.id, banner.priority, currentPriority.current, lastFiredAt.current, now)) {
        return
      }

      lastFiredAt.current[banner.id] = now
      currentPriority.current = banner.priority

      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      setActiveBanner(banner)

      dismissTimer.current = setTimeout(() => {
        setActiveBanner(null)
        currentPriority.current = Infinity
      }, AUTO_DISMISS_MS)
    }, [])

    return { activeBanner, showBanner }
  }
  ```

- [ ] **Step 4: Run test to confirm it passes**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm test -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|✓|×"
  ```

  Expected: all 6 `canShowBanner` tests pass.

- [ ] **Step 5: Create `StateBanner.tsx`**

  ```tsx
  // frontend/src/components/ui/StateBanner.tsx
  import { motion, AnimatePresence } from 'framer-motion'
  import type { BannerState } from '../../hooks/useStateBanners'

  interface StateBannerProps {
    banner: BannerState | null
  }

  export default function StateBanner({ banner }: StateBannerProps) {
    return (
      <AnimatePresence mode="wait">
        {banner && (
          <motion.div
            key={banner.id + banner.text}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 12px',
              borderRadius: 7,
              border: `1px solid ${banner.color}40`,
              background: `${banner.color}0d`,
              fontSize: 10,
              fontWeight: 600,
              color: '#94a3b8',
              marginBottom: 10,
            }}
          >
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: banner.color, flexShrink: 0,
            }} />
            {banner.text}
          </motion.div>
        )}
      </AnimatePresence>
    )
  }
  ```

- [ ] **Step 6: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/hooks/useStateBanners.ts frontend/src/hooks/useStateBanners.test.ts frontend/src/components/ui/StateBanner.tsx
  git commit -m "feat(ui): add useStateBanners hook, StateBanner component, and unit tests"
  ```

---

## Phase 2 — Navigation

### Task 4: Responsive Navigation — BottomNav + AppShell

**Files:**
- Create: `frontend/src/components/layout/BottomNav.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create `BottomNav.tsx`**

  ```tsx
  // frontend/src/components/layout/BottomNav.tsx
  import { NavLink } from 'react-router-dom'
  import { Activity, Clock, Archive, BarChart2, Sliders } from 'lucide-react'

  const NAV_ITEMS = [
    { to: '/',              label: 'Current',  icon: Activity,  end: true },
    { to: '/history',       label: 'History',  icon: Clock },
    { to: '/event-replay',  label: 'Events',   icon: Archive },
    { to: '/model-drivers', label: 'Signals',  icon: BarChart2 },
    { to: '/scenario',      label: 'Scenario', icon: Sliders },
  ]

  export default function BottomNav() {
    return (
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{
          height: 60,
          background: '#0a0d16',
          borderTop: '1px solid #151d2e',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex-1 no-underline"
            style={{ textDecoration: 'none' }}
          >
            {({ isActive }) => (
              <div
                className="flex flex-col items-center justify-center h-full gap-0.5"
                style={{ position: 'relative' }}
              >
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: '25%',
                    right: '25%',
                    height: 2,
                    background: '#06b6d4',
                    borderRadius: '0 0 2px 2px',
                  }} />
                )}
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 2}
                  style={{ color: isActive ? '#f1f5f9' : '#4a6080' }}
                />
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '.06em',
                  color: isActive ? '#f1f5f9' : '#4a6080',
                }}>
                  {label}
                </span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>
    )
  }
  ```

- [ ] **Step 2: Update `AppShell.tsx`**

  Replace the entire file:

  ```tsx
  // frontend/src/components/layout/AppShell.tsx
  import { Outlet } from 'react-router-dom'
  import Sidebar from './Sidebar'
  import BottomNav from './BottomNav'

  export default function AppShell() {
    return (
      <div className="min-h-screen" style={{ background: '#080b12' }}>
        <Sidebar />
        <BottomNav />
        <main className="lg:ml-[196px] ml-0 pb-[60px] lg:pb-0 min-h-screen overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    )
  }
  ```

- [ ] **Step 3: Update `Sidebar.tsx` — hide on mobile**

  Open `frontend/src/components/layout/Sidebar.tsx`. Find the root `<div>` element (it has `style={{ position: 'fixed', ... }}`). Add `className="hidden lg:flex flex-col"` to it. Do not change any other part of the sidebar.

  The root element should look like:
  ```tsx
  <div
    className="hidden lg:flex flex-col"
    style={{ position: 'fixed', left: 0, top: 0, height: '100vh', width: 196, ... }}
  >
  ```

  Read the file first to find the exact root element, then add `className="hidden lg:flex flex-col"`.

- [ ] **Step 4: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/components/layout/BottomNav.tsx frontend/src/components/layout/AppShell.tsx frontend/src/components/layout/Sidebar.tsx
  git commit -m "feat(ui): add mobile BottomNav; AppShell responsive (lg+ sidebar, <lg bottom nav)"
  ```

---

## Phase 3 — Core Pages

### Task 5: Current State — Editorial Hero Layout

**Files:**
- Modify: `frontend/src/pages/CurrentState.tsx`

This is the most significant layout change. The three equal-weight MetricCards are replaced with a dominant regime hero block. Risk gets its own glowing gauge row below. VIX and Trend become secondary chips.

- [ ] **Step 1: Read `CurrentState.tsx` in full before editing**

  Read `frontend/src/pages/CurrentState.tsx` completely before making any changes.

- [ ] **Step 2: Replace the return statement with the new editorial layout**

  The entire `return` block of `CurrentState` becomes:

  ```tsx
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <Topbar
        title="Current State"
        subtitle={undefined}
        action={refreshAction}
      />

      {data.mode === 'demo' && (
        <div
          className="mx-6 mt-3 px-4 py-2.5 rounded text-[11px] leading-relaxed"
          style={{ background: '#2d1f0a', border: '1px solid #92400e', color: '#fbbf24' }}
        >
          <strong>Demo mode</strong> — Using cached snapshot data (as of{' '}
          {data.as_of_ts ? new Date(data.as_of_ts).toLocaleDateString() : 'unknown'}). Live refresh unavailable.
        </div>
      )}

      <div className="px-6 py-5 space-y-6">

        {/* ── HERO BLOCK — Tier 1 Glass ── */}
        <motion.div
          custom={0}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
        >
          <div
            style={{
              background: 'rgba(12,16,32,0.85)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid ${rColor}26`,
              borderRadius: 12,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 32px rgba(0,0,0,0.5)',
              padding: '24px 28px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Radial regime glow */}
            <div style={{
              position: 'absolute', top: -80, left: -80,
              width: 300, height: 300,
              background: `radial-gradient(circle, ${rColor}1a 0%, transparent 70%)`,
              pointerEvents: 'none',
            }} />

            {/* Live indicator */}
            <div className="flex items-center gap-2 mb-3" style={{ position: 'relative', zIndex: 1 }}>
              <div className="live-dot" style={{ background: rColor }} />
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.12em', color: rColor, opacity: 0.85,
              }}>
                LIVE · {data.as_of_ts
                  ? new Date(data.as_of_ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—'}
              </span>
            </div>

            {/* Regime hero name */}
            <div
              style={{
                fontSize: 52, fontWeight: 900, color: rColor, lineHeight: 1,
                marginBottom: 14, letterSpacing: '-0.02em', position: 'relative', zIndex: 1,
              }}
            >
              {data.regime}
            </div>

            {/* Narrative */}
            <p style={{
              fontSize: 14, color: '#94a3b8', lineHeight: 1.65,
              maxWidth: 540, margin: 0, position: 'relative', zIndex: 1,
            }}>
              {narrative}
            </p>
          </div>
        </motion.div>

        {/* ── SECONDARY METRIC CHIPS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            {
              label: 'VIX Level',
              value: data.vix_level != null ? data.vix_level.toFixed(1) : '—',
              color: '#f1f5f9',
              subtitle: 'Market fear gauge',
            },
            {
              label: 'VIX Change',
              value: data.vix_chg_1d != null
                ? `${data.vix_chg_1d >= 0 ? '+' : ''}${data.vix_chg_1d.toFixed(2)}`
                : '—',
              color: data.vix_chg_1d != null && data.vix_chg_1d > 0 ? colors.red : colors.green,
              subtitle: '1-day change',
            },
            {
              label: 'Trend',
              value: data.trend.replace('trend', ''),
              color: '#94a3b8',
              subtitle: 'Recent price direction',
            },
          ].map((chip, i) => (
            <motion.div
              key={chip.label}
              custom={i + 1}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
              <div
                className="card-hover rounded-lg px-4 py-3"
                style={{
                  background: colors.surfaceElevated,
                  border: `1px solid ${colors.borderElevated}`,
                }}
              >
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '.1em', color: colors.textDim, marginBottom: 4,
                }}>
                  {chip.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: chip.color, lineHeight: 1 }}>
                  {chip.value}
                </div>
                <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 3 }}>
                  {chip.subtitle}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── TRANSITION RISK WITH GAUGE ── */}
        <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
          <div
            className="rounded-xl px-5 py-4"
            style={{ background: '#080d18', border: `1px solid ${colors.border}` }}
          >
            <div style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.1em', color: colors.textDim, marginBottom: 10,
            }}>
              Odds of worsening · next 5 trading days
            </div>
            {reliability?.out_of_range && (
              <span
                className="inline-block text-[9px] font-bold px-2 py-0.5 rounded mb-2"
                style={{ background: '#2d1500', border: '1px solid #78350f', color: '#fbbf24' }}
              >
                ⚠ OUT OF RANGE
              </span>
            )}
            <div className="flex items-center gap-4 flex-wrap">
              <span style={{ fontSize: 38, fontWeight: 900, color: riskColor, lineHeight: 1 }}>
                {formatRisk(data.transition_risk)}
              </span>
              <div style={{ flex: 1, minWidth: 80, height: 5, background: '#1a2540', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(data.transition_risk * 100, 100)}%`,
                  background: data.transition_risk > 0.40
                    ? 'linear-gradient(90deg,#f87171,#fbbf24)'
                    : data.transition_risk > 0.20
                      ? 'linear-gradient(90deg,#fbbf24,#f87171)'
                      : 'linear-gradient(90deg,#4ade80,#06b6d4)',
                  boxShadow: `0 0 8px ${riskColor}66`,
                  borderRadius: 3,
                }} />
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                color: riskColor,
                background: `${riskColor}15`,
                border: `1px solid ${riskColor}30`,
                borderRadius: 4, padding: '2px 8px',
              }}>
                {data.transition_risk > 0.40 ? 'ALERT' : data.transition_risk > 0.20 ? 'WATCH' : 'LOW'}
              </span>
            </div>
            {reliability && (
              <p className="text-[11px] leading-relaxed mt-3" style={{ color: colors.textMuted }}>
                {reliabilityLine(reliability)}
              </p>
            )}
          </div>
        </motion.div>

        {/* Daily diff, divider, chart, and driver sections remain unchanged below */}
        {/* Copy the existing dailyDiff block, divider, chart section, and top drivers section
            from the original file verbatim — no changes needed to those sections */}
      </div>
    </motion.div>
  )
  ```

  **Important:** At the top of the component function, add this import at the file level:
  ```tsx
  import { colors } from '../lib/tokens'
  ```

  And ensure `cardVariants` is defined (it already exists in the file):
  ```tsx
  const cardVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] } }),
  }
  ```

  Preserve the `riskColor` and `rColor` derivations exactly as they appear in the original file.

- [ ] **Step 3: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/CurrentState.tsx
  git commit -m "feat(ui): Current State editorial hero layout — regime name dominates as text-5xl hero"
  ```

---

### Task 6: MetricCard + Panel Surface Upgrades

**Files:**
- Modify: `frontend/src/components/ui/MetricCard.tsx`
- Modify: `frontend/src/components/ui/Panel.tsx`

- [ ] **Step 1: Read both files before editing**

  Read `frontend/src/components/ui/MetricCard.tsx` and `frontend/src/components/ui/Panel.tsx` in full.

- [ ] **Step 2: Update `MetricCard.tsx`**

  Replace with:

  ```tsx
  // frontend/src/components/ui/MetricCard.tsx
  import { colors } from '../../lib/tokens'

  interface MetricCardProps {
    label: string
    value: string
    valueColor?: string
    subtitle?: string
  }

  export default function MetricCard({ label, value, valueColor = colors.textPrimary, subtitle }: MetricCardProps) {
    return (
      <div
        className="card-hover rounded-lg px-4 py-3"
        style={{
          background: colors.surfaceElevated,
          border: `1px solid ${colors.borderElevated}`,
          boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '.1em', color: colors.textDim, marginBottom: 4,
        }}>
          {label}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: valueColor, lineHeight: 1 }}>
          {value}
        </div>
        {subtitle && (
          <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 3 }}>
            {subtitle}
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 3: Update `Panel.tsx`**

  Read the file, then add `card-hover` class and the elevated border to the panel's outer container. Keep the `title` prop and children rendering exactly as-is. Only the outer container style changes:

  ```tsx
  // The outer container should change from whatever it currently is to:
  <div
    className="rounded-lg"
    style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
    }}
  >
    {/* title bar and children — unchanged */}
  </div>
  ```

  Import `colors` from `'../../lib/tokens'` at the top.

- [ ] **Step 4: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/components/ui/MetricCard.tsx frontend/src/components/ui/Panel.tsx
  git commit -m "feat(ui): MetricCard and Panel surface tier upgrades, hover lift via card-hover class"
  ```

---

## Phase 4 — Charts

### Task 7: RiskLineChart → AreaChart with Custom Tooltip

**Files:**
- Modify: `frontend/src/components/charts/RiskLineChart.tsx`

- [ ] **Step 1: Read the current `RiskLineChart.tsx` in full**

- [ ] **Step 2: Replace with area chart implementation**

  ```tsx
  // frontend/src/components/charts/RiskLineChart.tsx
  import {
    AreaChart, Area, XAxis, YAxis, Tooltip,
    ResponsiveContainer, ReferenceLine,
  } from 'recharts'
  import type { HistoricalPoint } from '../../types/api'
  import { DEFAULT_THRESHOLD, ALERT_THRESHOLD } from '../../lib/constants'
  import ChartTooltip from './ChartTooltip'

  interface RiskLineChartProps {
    data: HistoricalPoint[]
  }

  function riskColor(value: number): string {
    if (value > ALERT_THRESHOLD) return '#f87171'
    if (value > DEFAULT_THRESHOLD) return '#fbbf24'
    return '#4ade80'
  }

  export default function RiskLineChart({ data }: RiskLineChartProps) {
    const lastPoint = data[data.length - 1]
    const currentColor = lastPoint ? riskColor(lastPoint.transition_risk ?? 0) : '#06b6d4'

    return (
      <div style={{ position: 'relative' }}>
        {/* Reference line annotation badges — positioned above chart */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 6 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
            color: '#fbbf24', background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.2)',
            borderRadius: 4, padding: '2px 7px',
          }}>
            Alert · {(ALERT_THRESHOLD * 100).toFixed(0)}%
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
            color: '#06b6d4', background: 'rgba(6,182,212,0.08)',
            border: '1px solid rgba(6,182,212,0.2)',
            borderRadius: 4, padding: '2px 7px',
          }}>
            Watch · {(DEFAULT_THRESHOLD * 100).toFixed(0)}%
          </span>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="riskAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={currentColor} stopOpacity={0.22} />
                <stop offset="100%" stopColor={currentColor} stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="date"
              tick={{ fill: '#4a6080', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: '#4a6080', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              domain={[0, 1]}
              width={38}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  {...props}
                  accentColor={currentColor}
                  formatter={(v) => `${(v * 100).toFixed(1)}%`}
                  labelFormatter={(l) => `${l}`}
                />
              )}
              wrapperStyle={{ pointerEvents: 'none' }}
            />
            <ReferenceLine
              y={DEFAULT_THRESHOLD}
              stroke="#06b6d4"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />
            <ReferenceLine
              y={ALERT_THRESHOLD}
              stroke="#fbbf24"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />
            <Area
              dataKey="transition_risk"
              stroke={currentColor}
              strokeWidth={2.5}
              fill="url(#riskAreaGradient)"
              dot={false}
              activeDot={(props: {cx:number;cy:number}) => (
                <g key={`dot-${props.cx}`}>
                  <circle cx={props.cx} cy={props.cy} r={8} fill={currentColor} fillOpacity={0.18} />
                  <circle cx={props.cx} cy={props.cy} r={4} fill={currentColor} />
                </g>
              )}
              isAnimationActive={true}
              animationDuration={800}
              animationEasing="ease-out"
              name="Risk"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )
  }
  ```

- [ ] **Step 3: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/components/charts/RiskLineChart.tsx
  git commit -m "feat(ui): RiskLineChart → AreaChart with gradient fill, custom tooltip, floating annotations"
  ```

---

### Task 8: RegimeChart — Area Fill, Band Hover, Custom Tooltip

**Files:**
- Modify: `frontend/src/components/charts/RegimeChart.tsx`

- [ ] **Step 1: Read `RegimeChart.tsx` in full**

- [ ] **Step 2: Apply upgrades**

  Key changes only (do not restructure the whole component):

  1. Replace `<CartesianGrid>` line with nothing (remove it entirely).

  2. Add `<defs>` with area gradient inside `<ComposedChart>`:
     ```tsx
     <defs>
       <linearGradient id="spyGradient" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.15} />
         <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
       </linearGradient>
     </defs>
     ```

  3. Replace `<Line dataKey="close" ...>` with `<Area dataKey="close" fill="url(#spyGradient)" stroke="#06b6d4" strokeWidth={1.5} dot={false} isAnimationActive={true} animationDuration={800} />`. Keep all the same yAxisId and other props.

  4. Replace the `<Tooltip>` with:
     ```tsx
     <Tooltip
       content={(props) => {
         if (!props.active || !props.payload?.length) return null
         const pt = props.payload[0]?.payload as HistoricalPoint
         if (!pt) return null
         return (
           <div style={{
             background: 'rgba(8,11,24,0.97)',
             border: '1px solid #1e3a5f',
             borderLeft: `3px solid ${REGIME_COLORS[pt.regime] ?? '#94a3b8'}`,
             borderRadius: 8,
             padding: '10px 14px',
             pointerEvents: 'none',
           }}>
             <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{pt.date}</div>
             <div style={{ fontSize: 12, fontWeight: 700, color: REGIME_COLORS[pt.regime] ?? '#94a3b8', textTransform: 'capitalize' }}>
               {pt.regime}
             </div>
             {pt.close != null && (
               <div style={{ fontSize: 12, color: '#f1f5f9', marginTop: 2 }}>
                 SPY ${pt.close.toFixed(2)}
               </div>
             )}
             {pt.transition_risk != null && (
               <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                 Risk: {(pt.transition_risk * 100).toFixed(1)}%
               </div>
             )}
           </div>
         )
       }}
       wrapperStyle={{ pointerEvents: 'none' }}
     />
     ```

  5. On each `<ReferenceArea>` element, add `fillOpacity={0.18}` (slightly more visible than before). Keep all other props unchanged.

  6. On the `XAxis` and `YAxis` elements, change `tick={{ fill: '#64748b', fontSize: 9 }}` to `tick={{ fill: '#4a6080', fontSize: 9 }}`.

- [ ] **Step 3: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/components/charts/RegimeChart.tsx
  git commit -m "feat(ui): RegimeChart — remove grid, area fill for SPY, custom regime tooltip"
  ```

---

## Phase 5 — Interaction Feedback

### Task 9: DriverBar Animated Fill + Typography

**Files:**
- Modify: `frontend/src/components/ui/DriverBar.tsx`

- [ ] **Step 1: Read `DriverBar.tsx` in full**

- [ ] **Step 2: Replace with animated version**

  ```tsx
  // frontend/src/components/ui/DriverBar.tsx
  import { colors } from '../../lib/tokens'

  interface DriverBarProps {
    label: string
    value: number     // 0–1 normalized importance/contribution
    max: number       // normalization max for width calc
    direction?: 'raising' | 'calming' | 'neutral'
    delay?: number    // animation stagger delay in ms
  }

  export default function DriverBar({ label, value, max, direction = 'neutral', delay = 0 }: DriverBarProps) {
    const pct = Math.min((value / (max || 1)) * 100, 100)
    const barColor = direction === 'raising'
      ? 'linear-gradient(90deg, #f87171, #fbbf24)'
      : direction === 'calming'
        ? 'linear-gradient(90deg, #4ade80, #06b6d4)'
        : 'linear-gradient(90deg, #06b6d4, #0e4d6e)'
    const scoreColor = direction === 'raising' ? colors.red : direction === 'calming' ? colors.green : colors.cyan

    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: colors.textSecondary }}>{label}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor }}>
            {direction === 'raising' ? '+' : direction === 'calming' ? '−' : ''}{value.toFixed(3)}
          </span>
        </div>
        <div style={{ height: 4, background: '#1a2540', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: barColor,
              borderRadius: 2,
              // CSS animation: width animates from 0 to pct after a stagger delay
              animation: `barFill 350ms ease-out ${delay}ms both`,
            }}
          />
        </div>
      </div>
    )
  }
  ```

  Add the `barFill` keyframe to `frontend/src/App.css`:
  ```css
  /* ── Driver bar fill animation ── */
  @keyframes barFill {
    from { width: 0%; }
  }
  ```

- [ ] **Step 3: Update all call sites of `DriverBar` to pass `delay`**

  In `frontend/src/pages/CurrentState.tsx` and `frontend/src/pages/ModelDrivers.tsx`, wherever `DriverBar` is used in a `.map()`, pass `delay={index * 40}`:

  ```tsx
  {topDrivers.map((d, i) => (
    <DriverBar
      key={d.feature}
      label={labelFor(d.feature)}
      value={d.importance}
      max={maxImp}
      direction={...}
      delay={i * 40}
    />
  ))}
  ```

- [ ] **Step 4: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/components/ui/DriverBar.tsx frontend/src/App.css frontend/src/pages/CurrentState.tsx frontend/src/pages/ModelDrivers.tsx
  git commit -m "feat(ui): DriverBar animated fill with stagger delay, typography upgrade"
  ```

---

### Task 10: AnimatePresence for All Expand/Collapse Patterns

**Files:**
- Modify: `frontend/src/pages/ModelDrivers.tsx` (reliability accordion)
- Modify: `frontend/src/components/ui/HelpDrawer.tsx`

The current pattern `{condition && <Component />}` produces abrupt mounts. Replace every collapsible section with AnimatePresence + animated height.

- [ ] **Step 1: Read `ModelDrivers.tsx` in full**

- [ ] **Step 2: Replace the reliability accordion in `ModelDrivers.tsx`**

  Find the reliability accordion pattern (currently a `{reliabilityOpen && <ReliabilityTable ... />}`). Replace the entire accordion with:

  ```tsx
  import { AnimatePresence, motion } from 'framer-motion'

  {/* Reliability accordion button — keep exactly as-is */}
  <button onClick={() => setReliabilityOpen(v => !v)} ...>
    ...
    {/* Change the arrow from a string to a motion.span that rotates */}
    <motion.span
      animate={{ rotate: reliabilityOpen ? 90 : 0 }}
      transition={{ duration: 0.15 }}
      style={{ display: 'inline-block', color: reliabilityHover ? '#94a3b8' : '#64748b', fontSize: 14, flexShrink: 0 }}
    >
      ▸
    </motion.span>
  </button>

  <AnimatePresence>
    {reliabilityOpen && (
      <motion.div
        key="reliability-table"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        style={{ overflow: 'hidden' }}
      >
        <ReliabilityTable rows={data.threshold_sweep} />
      </motion.div>
    )}
  </AnimatePresence>
  ```

- [ ] **Step 3: Apply same pattern to `HelpDrawer.tsx`**

  Read `frontend/src/components/ui/HelpDrawer.tsx`. Find `{open && <div ...>...</div>}` (the help panel). Replace with:

  ```tsx
  import { AnimatePresence, motion } from 'framer-motion'

  <AnimatePresence>
    {open && (
      <motion.div
        key="help-drawer"
        initial={{ opacity: 0, y: 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.97 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 10px)',
          left: 0,
          width: 220,
          background: '#0c1020',
          border: '1px solid #1e2a3a',
          borderRadius: 8,
          padding: '12px 14px',
          zIndex: 50,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          transformOrigin: 'bottom left',
        }}
      >
        {/* existing content — unchanged */}
      </motion.div>
    )}
  </AnimatePresence>
  ```

- [ ] **Step 4: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/pages/ModelDrivers.tsx frontend/src/components/ui/HelpDrawer.tsx
  git commit -m "feat(ui): AnimatePresence expand/collapse for reliability accordion and HelpDrawer"
  ```

---

### Task 11: Scenario Explorer — Input Ripple + Banner System

**Files:**
- Modify: `frontend/src/pages/ScenarioExplorer.tsx`

This is the most interaction-heavy change. The module ripple (`.module-base.module-lit`) makes affected outputs respond visually to every slider input. Banners fire only on meaningful state changes.

- [ ] **Step 1: Read `ScenarioExplorer.tsx` in full**

- [ ] **Step 2: Add imports at the top of the file**

  ```tsx
  import { useRef, useCallback } from 'react'
  import { useStateBanners } from '../hooks/useStateBanners'
  import StateBanner from '../components/ui/StateBanner'
  ```

- [ ] **Step 3: Add refs and banner hook inside the component**

  Inside `ScenarioExplorer` (or whichever component renders the scenario output), add:

  ```tsx
  const { activeBanner, showBanner } = useStateBanners()
  const riskModuleRef = useRef<HTMLDivElement>(null)
  const probModuleRef = useRef<HTMLDivElement>(null)

  const prevDominant = useRef<string | null>(null)
  const prevRiskBucket = useRef<string>('low')

  function riskBucket(pct: number): string {
    if (pct >= 0.40) return 'alert'
    if (pct >= 0.20) return 'watch'
    return 'low'
  }

  const flashModule = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    el.classList.remove('module-lit')
    void el.offsetWidth
    el.classList.add('module-lit')
    setTimeout(() => el.classList.remove('module-lit'), 120)
  }, [])
  ```

- [ ] **Step 4: Wire up the ripple and banners to slider onChange**

  Find the place where slider values change (in the `inputs` state or the individual slider `onValueChange` callbacks). After any slider value updates, call:

  ```tsx
  // After updating inputs state (in the slider onChange handler):
  flashModule(riskModuleRef.current)
  flashModule(probModuleRef.current)

  // Check for dominant regime flip
  const newDominant = data?.dominant_regime ?? null
  if (newDominant && prevDominant.current && newDominant !== prevDominant.current) {
    showBanner({
      id: 'regime-flip',
      priority: 1,
      text: `Dominant regime: ${prevDominant.current} → ${newDominant}`,
      color: regimeColor[newDominant.toLowerCase()] ?? '#06b6d4',
    })
  }
  if (newDominant) prevDominant.current = newDominant

  // Check for threshold crossings
  const risk = data?.prob_turbulent ?? 0
  const newBucket = riskBucket(risk)
  if (newBucket !== prevRiskBucket.current) {
    if (newBucket === 'watch' && prevRiskBucket.current === 'low')
      showBanner({ id: 'banner-threshold', priority: 3, text: '⚠ Crossed watch threshold (20%)', color: '#fbbf24' })
    else if (newBucket === 'alert' && prevRiskBucket.current !== 'alert')
      showBanner({ id: 'banner-threshold', priority: 2, text: '⚠ Crossed alert threshold (40%)', color: '#f87171' })
    else if (newBucket === 'low' && prevRiskBucket.current !== 'low')
      showBanner({ id: 'banner-threshold', priority: 4, text: '✓ Back below watch threshold', color: '#4ade80' })
    else if (newBucket === 'watch' && prevRiskBucket.current === 'alert')
      showBanner({ id: 'banner-threshold', priority: 4, text: '↓ Pulled back from alert zone', color: '#fbbf24' })
    prevRiskBucket.current = newBucket
  }
  ```

  Also fire a banner on reset:
  ```tsx
  // In the reset() handler, after reset call:
  showBanner({ id: 'reset-applied', priority: 5, text: '↺ Reset to baseline', color: '#06b6d4' })
  prevDominant.current = null
  prevRiskBucket.current = 'low'
  ```

- [ ] **Step 5: Add `className="module-base"` and refs to the output modules**

  Find the probability tile container and the risk module in the JSX. Add the class and ref:

  ```tsx
  {/* Probability output module */}
  <div ref={probModuleRef} className="module-base rounded-lg" style={{ border: '1px solid #151d2e', ... }}>
    ...
  </div>

  {/* Risk output module */}
  <div ref={riskModuleRef} className="module-base rounded-lg" style={{ border: '1px solid #151d2e', ... }}>
    ...
  </div>
  ```

- [ ] **Step 6: Add `<StateBanner>` at the top of the output column**

  In the JSX, just before the probability tiles, add:

  ```tsx
  <StateBanner banner={activeBanner} />
  ```

- [ ] **Step 7: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 8: Commit**

  ```bash
  git add frontend/src/pages/ScenarioExplorer.tsx
  git commit -m "feat(ui): Scenario Explorer input ripple, module-lit flash, and state change banners"
  ```

---

### Task 12: ProbabilityTripod — Spring Numbers + Dominant Glow Pulse

**Files:**
- Modify: `frontend/src/components/charts/ProbabilityTripod.tsx`

- [ ] **Step 1: Read `ProbabilityTripod.tsx` in full**

- [ ] **Step 2: Add `AnimatedNumber` sub-component and apply to tile values**

  Add this component at the top of the file (before `ProbabilityTripod`):

  ```tsx
  import { useSpring, useTransform, motion } from 'framer-motion'
  import { useEffect } from 'react'

  function AnimatedNumber({ value, suffix = '%' }: { value: number; suffix?: string }) {
    const spring = useSpring(value, { stiffness: 180, damping: 18 })
    const display = useTransform(spring, (v) => `${Math.round(v)}${suffix}`)

    useEffect(() => {
      spring.set(value)
    }, [value, spring])

    return <motion.span style={{ display: 'inline' }}>{display}</motion.span>
  }
  ```

- [ ] **Step 3: Replace static percentage renders with `AnimatedNumber`**

  In the tile JSX, find where `scenarioCalm`, `scenarioElevated`, `scenarioTurbulent` are rendered as percentages (e.g., `{(scenVal * 100).toFixed(0)}%`). Replace with:

  ```tsx
  <AnimatedNumber value={Math.round(scenVal * 100)} />
  ```

  Do this for all three regime tiles.

- [ ] **Step 4: Add glow pulse animation to dominant tile**

  Add these keyframes to `frontend/src/App.css`:

  ```css
  @keyframes dominant-pulse-green  { 0%,100%{box-shadow:0 0 20px rgba(74,222,128,0.1)} 40%{box-shadow:0 0 36px rgba(74,222,128,0.32)} }
  @keyframes dominant-pulse-amber  { 0%,100%{box-shadow:0 0 20px rgba(251,191,36,0.1)} 40%{box-shadow:0 0 36px rgba(251,191,36,0.32)} }
  @keyframes dominant-pulse-red    { 0%,100%{box-shadow:0 0 20px rgba(248,113,113,0.1)} 40%{box-shadow:0 0 36px rgba(248,113,113,0.32)} }
  .pulse-calm      { animation: dominant-pulse-green 380ms ease-out; }
  .pulse-elevated  { animation: dominant-pulse-amber 380ms ease-out; }
  .pulse-turbulent { animation: dominant-pulse-red   380ms ease-out; }
  ```

  In the component, track `prevDominant` with a ref. When `isDominant` flips to true on a tile, trigger the pulse class for 400ms:

  ```tsx
  const prevDominantRef = useRef<string | null>(null)
  const tileRef = { calm: useRef<HTMLDivElement>(null), elevated: useRef<HTMLDivElement>(null), turbulent: useRef<HTMLDivElement>(null) }

  // Derive dominant tile
  const dominant = scenarioCalm >= scenarioElevated && scenarioCalm >= scenarioTurbulent ? 'calm'
    : scenarioElevated >= scenarioTurbulent ? 'elevated' : 'turbulent'

  useEffect(() => {
    if (prevDominantRef.current && dominant !== prevDominantRef.current) {
      const el = tileRef[dominant as keyof typeof tileRef].current
      if (el) {
        el.classList.remove(`pulse-${dominant}`)
        void el.offsetWidth
        el.classList.add(`pulse-${dominant}`)
        setTimeout(() => el.classList.remove(`pulse-${dominant}`), 400)
      }
    }
    prevDominantRef.current = dominant
  }, [dominant])
  ```

  Add `ref={tileRef[tile.key]}` to each tile `<div>`.

- [ ] **Step 5: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/components/charts/ProbabilityTripod.tsx frontend/src/App.css
  git commit -m "feat(ui): ProbabilityTripod spring-animated numbers and dominant-flip glow pulse"
  ```

---

## Phase 6 — Remaining Pages & Polish

### Task 13: Skeleton Screens on All Loading States

**Files:**
- Modify: `frontend/src/pages/CurrentState.tsx`
- Modify: `frontend/src/pages/History.tsx`
- Modify: `frontend/src/pages/ModelDrivers.tsx`
- Modify: `frontend/src/pages/ScenarioExplorer.tsx`
- Modify: `frontend/src/pages/EventReplay.tsx`

Each page currently returns bare `<div className="p-6 text-slate-500 text-sm">Loading…</div>`. Replace every loading state with a composed skeleton.

- [ ] **Step 1: Replace loading states in all five pages**

  For each page, find `if (loading) return <div className="p-6 text-slate-500 text-sm">Loading…</div>` and replace with a skeleton appropriate to the page's layout. Use `SkeletonBlock` imported from `'../components/ui/SkeletonBlock'`.

  **CurrentState skeleton:**
  ```tsx
  import SkeletonBlock from '../components/ui/SkeletonBlock'

  if (loading) return (
    <div className="px-6 py-5 space-y-6">
      <SkeletonBlock height="160px" rounded={12} />
      <div className="grid grid-cols-3 gap-3">
        <SkeletonBlock height="72px" />
        <SkeletonBlock height="72px" />
        <SkeletonBlock height="72px" />
      </div>
      <SkeletonBlock height="80px" />
      <SkeletonBlock height="200px" />
    </div>
  )
  ```

  **History skeleton:**
  ```tsx
  if (loading) return (
    <div className="p-6 space-y-5">
      <SkeletonBlock height="280px" />
      <SkeletonBlock height="220px" />
      <SkeletonBlock height="120px" />
    </div>
  )
  ```

  **ModelDrivers skeleton:**
  ```tsx
  if (loading) return (
    <div className="p-5 space-y-4">
      <SkeletonBlock height="120px" />
      <SkeletonBlock height="200px" />
      <SkeletonBlock height="80px" />
    </div>
  )
  ```

  **ScenarioExplorer skeleton:** Keep the existing loading behavior (it shows spinner inside the output panel); no change needed if it already handles it gracefully. If it shows bare "Loading…", replace with:
  ```tsx
  if (loading) return (
    <div className="p-5 flex gap-5">
      <SkeletonBlock width="276px" height="400px" />
      <div className="flex-1 space-y-4">
        <SkeletonBlock height="100px" />
        <SkeletonBlock height="120px" />
        <SkeletonBlock height="200px" />
      </div>
    </div>
  )
  ```

  **EventReplay skeleton:**
  ```tsx
  if (loading) return (
    <div className="p-5 space-y-4">
      <SkeletonBlock height="240px" />
      <SkeletonBlock height="80px" />
    </div>
  )
  ```

- [ ] **Step 2: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/pages/CurrentState.tsx frontend/src/pages/History.tsx frontend/src/pages/ModelDrivers.tsx frontend/src/pages/ScenarioExplorer.tsx frontend/src/pages/EventReplay.tsx
  git commit -m "feat(ui): skeleton screens replace bare Loading text on all five pages"
  ```

---

### Task 14: History Page — VIX Toggle Polish + ChangelogFeed Timeline

**Files:**
- Modify: `frontend/src/pages/History.tsx`
- Modify: `frontend/src/components/ui/ChangelogFeed.tsx`

- [ ] **Step 1: Read both files in full**

- [ ] **Step 2: Polish History page layout**

  In `History.tsx`:
  - Change `transition={{ duration: 0.2 }}` → `transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}`
  - Change `className="p-5 space-y-5"` → `className="px-6 py-5 space-y-6"`
  - Style the VIX toggle button with `card-hover`:
    ```tsx
    <button
      onClick={() => setShowVix(v => !v)}
      className="card-hover text-[10px] font-bold px-3 py-1.5 rounded"
      style={{
        background: showVix ? '#0e4d6e' : '#0c1020',
        border: `1px solid ${showVix ? '#06b6d4' : '#1a2540'}`,
        color: showVix ? '#06b6d4' : '#64748b',
        transition: 'background 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out',
      }}
    >
      {showVix ? '▼ Hide VIX' : '▲ Overlay VIX'}
    </button>
    ```

- [ ] **Step 3: Redesign `ChangelogFeed.tsx` as a vertical timeline**

  Read the current file, then replace the render logic with a vertical timeline layout. Keep all data fetching and types unchanged — only the visual output changes.

  ```tsx
  // frontend/src/components/ui/ChangelogFeed.tsx
  // (Keep all existing imports, types, and hook if any — only change the JSX)

  // In the render/return, replace the feed list with:
  import { regimeColor } from '../../lib/tokens'

  // Inside the component, after data is available:
  return (
    <div style={{ position: 'relative', paddingLeft: 20 }}>
      {/* Vertical connector line */}
      <div style={{
        position: 'absolute',
        left: 7,
        top: 8,
        bottom: 8,
        width: 1,
        background: 'linear-gradient(to bottom, #1e2940, #0f1929)',
      }} />

      {data.entries.map((entry, i) => {
        const color = regimeColor[entry.regime?.toLowerCase() ?? 'unknown'] ?? '#64748b'
        return (
          <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 18, position: 'relative' }}>
            {/* Node */}
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: `${color}20`,
              border: `2px solid ${color}`,
              flexShrink: 0,
              marginTop: 2,
              position: 'relative',
              zIndex: 1,
            }} />
            {/* Content */}
            <div style={{ flex: 1, paddingBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{entry.date}</span>
                {entry.regime && (
                  <span style={{
                    fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
                    color, background: `${color}15`, border: `1px solid ${color}30`,
                    borderRadius: 4, padding: '1px 6px',
                  }}>
                    {entry.regime}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                {entry.event}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
  ```

- [ ] **Step 4: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/pages/History.tsx frontend/src/components/ui/ChangelogFeed.tsx
  git commit -m "feat(ui): History VIX toggle polish; ChangelogFeed redesigned as vertical timeline"
  ```

---

### Task 15: Signal Breakdown + AnalogCard Glass Surface

**Files:**
- Modify: `frontend/src/pages/ModelDrivers.tsx`
- Modify: `frontend/src/components/AnalogCard.tsx`

- [ ] **Step 1: Read both files in full**

- [ ] **Step 2: Typography pass on `ModelDrivers.tsx`**

  Find all inline `fontSize` values below 10 in the file. Bump each one to at minimum 10. Specifically:
  - All `fontSize: 9` → `fontSize: 10`
  - `fontSize: 8` or `fontSize: 8.5` → `fontSize: 10`

  In the `ReliabilityTable` internal component, change:
  - `fontSize: 9` (header) → `fontSize: 10`
  - `fontSize: 10` (cell) → stays
  - The explanatory paragraph `fontSize: 9` → `fontSize: 10`

  Change the page's mount transition: `transition={{ duration: 0.2 }}` → `transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}`

- [ ] **Step 3: Apply glass surface to AnalogCard**

  Read `frontend/src/components/AnalogCard.tsx`. Replace the outer card container's background/border:

  ```tsx
  // The outer card div should use:
  style={{
    background: 'rgba(12,16,32,0.85)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: `1px solid ${regimeColor[analogRegime]}26`,
    borderRadius: 10,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.4)',
    padding: '14px 16px',
  }}
  ```

  Where `analogRegime` is the lowercase regime string from the analog entry. Import `regimeColor` from `'../lib/tokens'`.

- [ ] **Step 4: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/pages/ModelDrivers.tsx frontend/src/components/AnalogCard.tsx
  git commit -m "feat(ui): Signal Breakdown typography pass (10px min); AnalogCard glass surface"
  ```

---

### Task 16: Event Replay — Light Polish Pass

**Files:**
- Modify: `frontend/src/pages/EventReplay.tsx`
- Modify: `frontend/src/components/charts/EventReplayChart.tsx`

- [ ] **Step 1: Read both files in full**

- [ ] **Step 2: Polish `EventReplay.tsx`**

  - Change mount transition to `duration: 0.35, ease: [0.16, 1, 0.3, 1]`
  - Change padding class `p-5` → `px-6 py-5`
  - Find any `fontSize: 9` or `fontSize: 8` and bump to minimum 10
  - Add `space-y-6` to the main content wrapper (instead of `space-y-5`)

- [ ] **Step 3: In `EventReplayChart.tsx`**, apply the same tooltip upgrade

  Replace the existing `<Tooltip>` with the `ChartTooltip` component:

  ```tsx
  import ChartTooltip from './ChartTooltip'

  <Tooltip
    content={(props) => (
      <ChartTooltip
        {...props}
        accentColor="#06b6d4"
        formatter={(v) => `${(v * 100).toFixed(1)}%`}
      />
    )}
    wrapperStyle={{ pointerEvents: 'none' }}
  />
  ```

- [ ] **Step 4: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/pages/EventReplay.tsx frontend/src/components/charts/EventReplayChart.tsx
  git commit -m "feat(ui): Event Replay light pass — spacing, typography, shared tooltip"
  ```

---

### Task 17: Mobile Grid Adaptations

**Files:**
- Modify: `frontend/src/pages/CurrentState.tsx`
- Modify: `frontend/src/pages/ModelDrivers.tsx`
- Modify: `frontend/src/components/ClosestHistoricalSetups.tsx`
- Modify: `frontend/src/pages/ScenarioExplorer.tsx`
- Modify: `frontend/src/components/layout/Topbar.tsx`

Apply mobile-responsive grid and layout adjustments throughout.

- [ ] **Step 1: `CurrentState.tsx` — secondary chip grid**

  The three chip cards currently use `grid-cols-2 sm:grid-cols-3`. This was set in Task 5. Verify it's already there. If not, change the grid class from `grid-cols-3` to `grid-cols-2 sm:grid-cols-3`.

- [ ] **Step 2: `ModelDrivers.tsx` — two-column sections go full-width on mobile**

  Find any `grid grid-cols-2 gap-3` in the file and change to `grid grid-cols-1 sm:grid-cols-2 gap-3`.

- [ ] **Step 3: `ClosestHistoricalSetups.tsx` — analog card grid**

  Read `frontend/src/components/ClosestHistoricalSetups.tsx`. Find the `sm:grid-cols-3` grid. Change from:
  ```tsx
  className="grid sm:grid-cols-3 gap-4"
  ```
  to:
  ```tsx
  className="grid grid-cols-1 sm:grid-cols-3 gap-4"
  ```

- [ ] **Step 4: `ScenarioExplorer.tsx` — stack on mobile**

  The scenario explorer uses a `flex gap-5` layout with a fixed-width left column (`width: 276`). On mobile this must stack:

  ```tsx
  {/* Change: */}
  <div className="p-5 flex gap-5">
    <div className="shrink-0 space-y-4" style={{ width: 276 }}>

  {/* To: */}
  <div className="px-6 py-5 flex flex-col lg:flex-row gap-5">
    <div className="w-full lg:w-[276px] shrink-0 space-y-4">
  ```

  The right column (output panel) should also adjust: add `className="flex-1 min-w-0"` to ensure it doesn't overflow on mobile.

- [ ] **Step 5: `Topbar.tsx` — hide subtitle on narrow mobile**

  ```tsx
  {subtitle && (
    <div className="text-[10px] text-slate-500 hidden sm:block">{subtitle}</div>
  )}
  ```

- [ ] **Step 6: Verify build**

  ```bash
  cd /Users/kanuj/regime-radar/frontend && npm run build
  ```

  Expected: `✓ built in X.XXs`

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/pages/CurrentState.tsx frontend/src/pages/ModelDrivers.tsx frontend/src/components/ClosestHistoricalSetups.tsx frontend/src/pages/ScenarioExplorer.tsx frontend/src/components/layout/Topbar.tsx
  git commit -m "feat(ui): mobile grid adaptations — responsive cols, stacked scenario layout, topbar subtitle"
  ```

---

## Self-Review

After writing this plan, spec coverage check:

| Spec Requirement | Task(s) |
|---|---|
| Extend tokens (surfaceElevated, glass, glows) | Task 1 |
| Typography scale (10px min, hero at text-5xl) | Tasks 5, 15, 16 |
| Three surface tiers (glass, elevated, panel) | Tasks 5, 6, 15 |
| Spacing normalization | Tasks 5, 14, 16, 17 |
| Current State editorial hero | Task 5 |
| Hero must stay regime-led (no squeezing) | Task 5 — grid-cols-2 sm:grid-cols-3 chips below |
| MetricCard + Panel upgrade | Task 6 |
| BottomNav + responsive AppShell | Task 4 |
| Sidebar hidden on mobile | Task 4 |
| RiskLineChart → area chart | Task 7 |
| RegimeChart → area fill + hover tooltip | Task 8 |
| Shared ChartTooltip | Task 2, used in Tasks 7, 8, 16 |
| DriverBar animated fill + stagger | Task 9 |
| AnimatePresence expand/collapse | Task 10 |
| Scenario input ripple (module-lit) | Task 11 |
| Scenario banners (edge-triggered, priority, cooldown) | Tasks 3 + 11 |
| ProbabilityTripod spring numbers + dominant pulse | Task 12 |
| Skeleton screens all pages | Task 13 |
| History timeline changelog | Task 14 |
| VIX toggle transition polish | Task 14 |
| Signal Breakdown typography (10px min) | Task 15 |
| AnalogCard glass surface | Task 15 |
| Event Replay light pass | Task 16 |
| Mobile grid adaptations | Task 17 |
| Topbar subtitle hidden on mobile | Task 17 |
| card-hover lift + active:scale | Tasks 1 (CSS), 6 |
| Refresh button loading state | Not explicitly tasked — add to Task 5 or 6 as a small addition to CurrentState's refreshAction button: add `className="spin"` to the icon while `loading` and `disabled` + `opacity-50` to the button |
| Hero chart readability rule | Tasks 7, 8 — preserved axes, reference lines, annotation badges |
| 10px font minimum everywhere | Tasks 9, 15, 16 |

**One gap found:** Refresh button loading state was in the spec but not assigned to a task. Add it to Task 5: in `CurrentState.tsx`, change `refreshAction` to:

```tsx
const refreshAction = (
  <button
    onClick={refresh}
    disabled={loading}
    className="text-[10px] font-bold px-3 py-1.5 rounded flex items-center gap-1.5"
    style={{
      background: '#0c1020',
      border: '1px solid #151d2e',
      color: '#06b6d4',
      opacity: loading ? 0.5 : 1,
      cursor: loading ? 'not-allowed' : 'pointer',
      transition: 'opacity 150ms',
    }}
  >
    <span className={loading ? 'spin' : ''}>↻</span>
    Refresh
  </button>
)
```
