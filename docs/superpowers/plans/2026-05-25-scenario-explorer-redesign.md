# Scenario Explorer Left Column Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-open accordion with a persistent preset chip strip, a single collapsible Drivers section (localStorage-persisted open state), and an always-visible Threshold row; add four-state chip tracking and a "customized from preset" indicator with a reset affordance.

**Architecture:** Two files change: `ScenarioSlider` gains a `presetValue` prop that drives changed-from-preset rendering (accent value, preset annotation, two-fill track); `ScenarioExplorer` replaces `openSection` accordion state with `driversOpen` + `activePresetId` + `presetThreshold`, derives `isCustomized` via deterministic snapped-value comparison, and restructures the left-column JSX. Smoke tests are updated last.

**Tech Stack:** React 18, TypeScript, Framer Motion (AnimatePresence for drivers collapse), Playwright (smoke tests)

**Spec:** `docs/superpowers/specs/2026-05-25-scenario-explorer-redesign.md`

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/components/ui/ScenarioSlider.tsx` | Add `presetValue?` prop; export `roundToStep`; tighter padding; two-fill track + annotation |
| `frontend/src/pages/ScenarioExplorer.tsx` | Replace accordion; add chip/drivers/threshold state; restructure left column JSX |
| `frontend/tests/smoke/smoke.spec.ts` | 4 new tests (preset always-visible, customized indicator, inline reset, drivers toggle); update 7 existing tests that click the old accordion headers |

---

### Task 1: Write failing smoke tests for new behaviors

**Files:**
- Modify: `frontend/tests/smoke/smoke.spec.ts`

- [ ] **Step 1: Add 4 new tests inside the Scenario Explorer describe block**

Open `frontend/tests/smoke/smoke.spec.ts`. Locate the closing `})` of the `'Scenario Explorer page'` describe block (currently line 401). Insert the following four tests **before that closing `})`**:

```typescript
  test('preset chip strip is visible without opening any section', async ({ page }) => {
    await page.goto('/scenario')
    await waitForLoad(page)
    // Presets always visible — no section click required
    await expect(page.getByText('Calm Recovery')).toBeVisible()
    await expect(page.getByText('Volatility Pickup')).toBeVisible()
    await expect(page.getByText('Panic Shock')).toBeVisible()
  })

  test('customized indicator appears after clicking preset then moving a slider', async ({ page }) => {
    const done = page.waitForResponse(
      r => r.url().includes('/scenario') && r.status() === 200,
      { timeout: 15_000 },
    )
    await page.goto('/scenario')
    await done
    await page.waitForTimeout(400)
    await page.getByText('Calm Recovery').click()
    await page.waitForTimeout(400)
    // Move the first range slider away from its preset value
    await page.locator('input[type="range"]').first().evaluate((el: HTMLInputElement) => {
      el.value = String(parseFloat(el.max) * 0.8)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    await expect(page.getByText(/Modified from/)).toBeVisible()
  })

  test('inline reset button in customized state returns chip to untouched', async ({ page }) => {
    const done = page.waitForResponse(
      r => r.url().includes('/scenario') && r.status() === 200,
      { timeout: 15_000 },
    )
    await page.goto('/scenario')
    await done
    await page.waitForTimeout(400)
    await page.getByText('Calm Recovery').click()
    await page.waitForTimeout(400)
    await page.locator('input[type="range"]').first().evaluate((el: HTMLInputElement) => {
      el.value = String(parseFloat(el.max) * 0.8)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    await expect(page.getByText(/Modified from/)).toBeVisible()
    // Click the inline ↺ reset pill (not the topbar reset)
    await page.getByRole('button', { name: /↺ reset/i }).last().click()
    await page.waitForTimeout(300)
    await expect(page.getByText(/Modified from/)).not.toBeVisible()
  })

  test('Drivers section can be toggled collapsed and re-expanded', async ({ page }) => {
    await page.goto('/scenario')
    await waitForLoad(page)
    // Drivers open by default on desktop
    await expect(page.locator('input[type="range"]').first()).toBeVisible()
    // Toggle closed
    await page.getByRole('button', { name: /Drivers/i }).click()
    await page.waitForTimeout(250)
    await expect(page.locator('input[type="range"]').first()).not.toBeVisible()
    // Toggle open again
    await page.getByRole('button', { name: /Drivers/i }).click()
    await page.waitForTimeout(250)
    await expect(page.locator('input[type="range"]').first()).toBeVisible()
  })
```

- [ ] **Step 2: Run the 4 new tests to confirm they all fail**

```bash
cd frontend && npx playwright test tests/smoke/smoke.spec.ts \
  --grep "preset chip strip is visible|customized indicator appears|inline reset button|Drivers section can be toggled" \
  --reporter=line 2>&1 | tail -20
```

Expected: 4 FAIL (current UI still uses the old accordion structure).

---

### Task 2: Update ScenarioSlider — tighter layout and presetValue prop

**Files:**
- Modify: `frontend/src/components/ui/ScenarioSlider.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
import { colors } from '../../lib/tokens'

export function formatSliderValue(value: number, decimals: number): string {
  return value.toFixed(decimals)
}

/** Snap a value to the nearest step increment — matches the range input's own rounding. */
export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step
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
  /** When provided, activates changed-from-preset styling if value ≠ presetValue after snapping. */
  presetValue?: number
  onChange: (value: number) => void
}

export default function ScenarioSlider({
  label, value, min, max, step,
  sensitivityLevel = 'low',
  decimals = 1,
  presetValue,
  onChange,
}: ScenarioSliderProps) {
  const dotColor = SENSITIVITY_COLOR[sensitivityLevel]

  const isChanged = presetValue !== undefined &&
    roundToStep(value, step) !== roundToStep(presetValue, step)

  const range = max - min
  const currentFrac = Math.max(0, Math.min(1, (value - min) / range))
  const presetFrac = presetValue !== undefined
    ? Math.max(0, Math.min(1, (presetValue - min) / range))
    : null

  const loFrac = presetFrac !== null ? Math.min(currentFrac, presetFrac) : 0
  const hiFrac = presetFrac !== null ? Math.max(currentFrac, presetFrac) : currentFrac

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '2px 0' }}>
      {/* Label row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: colors.textSecondary }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, minWidth: 36, textAlign: 'right',
            color: isChanged ? '#60a5fa' : colors.textPrimary,
          }}>
            {formatSliderValue(value, decimals)}
          </span>
          {isChanged && presetValue !== undefined && (
            <span style={{ fontSize: 9, color: '#2d4a6a', whiteSpace: 'nowrap' }}>
              (preset: {formatSliderValue(presetValue, decimals)})
            </span>
          )}
        </div>
      </div>

      {/* Track with optional two-fill for preset delta */}
      <div style={{ position: 'relative', height: 3 }}>
        {/* Base track */}
        <div style={{ position: 'absolute', inset: 0, background: '#1e2a3a', borderRadius: 2 }} />

        {isChanged && presetFrac !== null ? (
          <>
            {/* Dim fill from 0 to the lower of current/preset positions */}
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${loFrac * 100}%`,
              background: '#1e3a5c', borderRadius: 2,
            }} />
            {/* Bright delta fill between preset and current */}
            <div style={{
              position: 'absolute', left: `${loFrac * 100}%`, top: 0, bottom: 0,
              width: `${(hiFrac - loFrac) * 100}%`,
              background: '#3b82f6', borderRadius: 2,
            }} />
          </>
        ) : (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${currentFrac * 100}%`,
            background: '#3b82f6', borderRadius: 2,
          }} />
        )}

        {/* Invisible range input overlaid for interaction */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer', margin: 0,
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/ScenarioSlider.tsx
git commit -m "feat(scenario): ScenarioSlider — tighter padding, presetValue prop, two-fill delta track"
```

---

### Task 3: ScenarioExplorer — full state refactor and left column JSX restructure

**Files:**
- Modify: `frontend/src/pages/ScenarioExplorer.tsx`

This task replaces the accordion logic, adds new state, and rewrites the left column JSX. The right column (lines 439–759 in the current file) is **untouched**.

- [ ] **Step 1: Add `roundToStep` import at the top of the file**

Find the existing import block. Add this import alongside the existing `ScenarioSlider` import:

```typescript
import ScenarioSlider, { roundToStep } from '../components/ui/ScenarioSlider'
```

(Replace the existing `import ScenarioSlider from '../components/ui/ScenarioSlider'` line.)

- [ ] **Step 2: Replace the three state lines at the top of the component**

Find (lines ~113–115):
```typescript
  const [inputs, setInputs] = useState<ScenarioInputs>(DEFAULT_INPUTS)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [openSection, setOpenSection] = useState<'presets' | 'drivers' | 'threshold'>('drivers')
```

Replace with:
```typescript
  const [inputs, setInputs] = useState<ScenarioInputs>(DEFAULT_INPUTS)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [presetThreshold, setPresetThreshold] = useState<number | null>(null)
  const [driversOpen, setDriversOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem('scenario-drivers-open')
    if (stored !== null) return stored === 'true'
    return window.innerWidth >= 1024
  })
```

- [ ] **Step 3: Add `toggleDrivers` callback and `isCustomized` derived value**

Find the existing `reset` useCallback (line ~137). After the `reset` callback's closing `},[...])`, add:

```typescript
  const toggleDrivers = useCallback(() => {
    setDriversOpen(prev => {
      const next = !prev
      localStorage.setItem('scenario-drivers-open', String(next))
      return next
    })
  }, [])
```

Then find `const forwardBullets` (or the line where `dominant` is computed, around line ~164–171). After the `dominant` const, add:

```typescript
  const isCustomized = (() => {
    if (activePresetId == null) return false
    const preset = PRESETS[activePresetId]
    return SLIDER_KEYS_FOR_SENSITIVITY.some(key => {
      const cfg = SLIDER_CONFIG.find(c => c.key === key)!
      return roundToStep(inputs[key], cfg.step) !== roundToStep(preset[key], cfg.step)
    })
  })()
```

- [ ] **Step 4: Update `reset` callback to clear preset state**

Find the `reset` useCallback body. Replace it with:

```typescript
  const reset = useCallback(
    () => {
      setInputs(currentMarketInputs ?? DEFAULT_INPUTS)
      setActivePresetId(null)
      setPresetThreshold(null)
      showBanner({ id: 'reset-applied', priority: 5, text: '↺ Reset to baseline', color: '#06b6d4' })
      prevDominant.current = null
      prevRiskBucket.current = 'low'
    },
    [currentMarketInputs, showBanner],
  )
```

- [ ] **Step 5: Add chip-style helper and micro-label constant before the JSX return**

Find the `return (` line (the start of the JSX). Immediately before it, add:

```typescript
  const microLabelStyle: React.CSSProperties = {
    fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#334155',
  }

  const getChipStyle = (presetId: string): React.CSSProperties => {
    const isActive = activePresetId === presetId
    const isCrisis = presetId === 'crisis_peak'
    const base: React.CSSProperties = { borderRadius: 14, fontSize: 11, cursor: 'pointer', textAlign: 'left' as const }
    if (!isActive) {
      return isCrisis
        ? { ...base, background: '#0e0505', border: '1px solid #7f1d1d', color: '#fca5a5', padding: '4px 12px' }
        : { ...base, background: '#0a0f1c', border: '1px solid #1e2a3a', color: '#64748b', padding: '4px 12px' }
    }
    if (isCustomized) {
      return isCrisis
        ? { ...base, background: '#080505', border: '1.5px dashed #6b2020', color: '#cc7070', fontWeight: 500, padding: '3px 11px' }
        : { ...base, background: '#080c18', border: '1.5px dashed #3a5070', color: '#8099bb', fontWeight: 500, padding: '3px 11px' }
    }
    return isCrisis
      ? { ...base, background: '#150505', border: '2px solid #f87171', color: '#fca5a5', fontWeight: 600, padding: '3px 12px' }
      : { ...base, background: '#0d1a30', border: '2px solid #3b82f6', color: '#93c5fd', fontWeight: 600, padding: '3px 12px' }
  }

  const ALL_PRESETS = [...STANDARD_PRESETS, CRISIS_PRESET]
```

- [ ] **Step 6: Delete the `SectionHeader` inline function**

Find and delete the `function SectionHeader(...)` inline function (currently lines ~229–247). It is no longer used.

- [ ] **Step 7: Replace the entire left column JSX**

The left column starts at the comment `{/* ── Left column ── */}` and ends just before `{/* ── Right column ── */}`. Replace everything between those two comments (inclusive of the left column outer `<div>`) with:

```tsx
        {/* ── Left column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Preset chip strip — always visible */}
            <div>
              <div style={microLabelStyle}>Quick Scenarios</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {STANDARD_PRESETS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setInputs(PRESETS[p.id])
                      setActivePresetId(p.id)
                      setPresetThreshold(null)
                      showBanner({ id: 'preset-applied', priority: 5, text: `Preset: ${p.label}`, color: '#06b6d4' })
                    }}
                    style={getChipStyle(p.id)}
                  >
                    {p.icon} {p.label}
                    {activePresetId === p.id && isCustomized && (
                      <span style={{ fontSize: 9, color: '#3b6fa8', marginLeft: 3 }}>✦</span>
                    )}
                  </button>
                ))}

                <div style={{ height: 1, background: '#1a0a0a', width: '100%', margin: '2px 0' }} />
                <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: '#5a2020', width: '100%' }}>
                  Sustained Crisis
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setInputs(PRESETS[CRISIS_PRESET.id])
                    setActivePresetId(CRISIS_PRESET.id)
                    setPresetThreshold(null)
                    showBanner({ id: 'preset-applied', priority: 5, text: `Preset: ${CRISIS_PRESET.label}`, color: '#06b6d4' })
                  }}
                  style={getChipStyle(CRISIS_PRESET.id)}
                >
                  {CRISIS_PRESET.icon} {CRISIS_PRESET.label}
                  {activePresetId === CRISIS_PRESET.id && isCustomized && (
                    <span style={{ fontSize: 9, color: '#3b6fa8', marginLeft: 3 }}>✦</span>
                  )}
                </button>
              </div>

              {/* Customized indicator row */}
              {isCustomized && activePresetId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, fontSize: 10, color: '#2d4a6a' }}>
                  <span style={{ color: '#3b6fa8' }}>✦</span>
                  {`Modified from "${ALL_PRESETS.find(p => p.id === activePresetId)?.label ?? activePresetId}"`}
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setInputs(PRESETS[activePresetId])
                      showBanner({ id: 'preset-reset', priority: 5, text: 'Reset to preset', color: '#06b6d4' })
                    }}
                    style={{
                      background: '#0d1a30', border: '1px solid #2a3d5c',
                      borderRadius: 8, padding: '2px 8px',
                      fontSize: 10, color: '#60a5fa', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    ↺ reset
                  </button>
                </div>
              )}
            </div>

            <div style={{ height: 1, background: colors.border }} />

            {/* Drivers — single collapsible section */}
            <div>
              <button
                type="button"
                onClick={toggleDrivers}
                aria-expanded={driversOpen}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: 0, background: 'none', border: 'none', cursor: 'pointer',
                  marginBottom: driversOpen ? 8 : 0,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary }}>Drivers</span>
                <motion.span
                  animate={{ rotate: driversOpen ? 0 : -90 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: 'inline-block', color: '#334155' }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {driversOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {SLIDER_CONFIG.map(cfg => {
                        const sensitivity = getSliderSensitivity(cfg.key, modelData?.global_importance)
                        const presetVal = activePresetId
                          ? (PRESETS[activePresetId] as ScenarioInputs)[cfg.key]
                          : undefined
                        return (
                          <ScenarioSlider
                            key={cfg.key}
                            label={cfg.label}
                            value={inputs[cfg.key]}
                            min={cfg.min}
                            max={cfg.max}
                            step={cfg.step}
                            sensitivityLevel={sensitivity}
                            decimals={cfg.step < 0.1 ? 2 : 1}
                            presetValue={presetVal}
                            onChange={v => {
                              setInputs(prev => ({ ...prev, [cfg.key]: v }))
                              flashModule(riskModuleRef.current)
                              flashModule(probModuleRef.current)
                            }}
                          />
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div style={{ height: 1, background: colors.border }} />

            {/* Alert Threshold — always visible, same control-row semantics as driver rows */}
            <div>
              <div style={microLabelStyle}>Alert Threshold</div>
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: colors.textMuted }}>Alert at</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24' }}>
                    {(threshold * 100).toFixed(0)}%
                  </span>
                </div>
                <div style={{ position: 'relative', height: 3 }}>
                  <div style={{ position: 'absolute', inset: 0, background: '#1e2a3a', borderRadius: 2 }} />
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${((threshold - 0.10) / (0.70 - 0.10)) * 100}%`,
                    background: '#fbbf24', borderRadius: 2,
                  }} />
                  <input
                    type="range" min={0.10} max={0.70} step={0.10}
                    value={threshold}
                    onChange={e => setThreshold(parseFloat(e.target.value))}
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%',
                      opacity: 0, cursor: 'pointer', margin: 0,
                    }}
                  />
                </div>

                {data && thresholdGap != null && (
                  <div
                    className="rounded-lg px-3 py-2 mt-3"
                    style={thresholdGap < 0
                      ? { background: '#0f2a1a', border: '1px solid #14532d' }
                      : { background: '#1a0505', border: '1px solid #7f1d1d' }}
                  >
                    <div
                      className="text-[10px] font-semibold"
                      style={{ color: thresholdGap < 0 ? '#4ade80' : '#f87171' }}
                    >
                      {thresholdGap < 0
                        ? '✓ This scenario stays below your alert threshold'
                        : '⚠ This scenario would cross your alert threshold'}
                    </div>
                    <div className="text-[9px] mt-1" style={{ color: '#475569' }}>
                      {thresholdGap < 0
                        ? `Stress probability ${(scenarioStress! * 100).toFixed(0)}% — ${Math.abs(thresholdGap * 100).toFixed(0)}pp below the ${(threshold * 100).toFixed(0)}% threshold`
                        : `Stress probability ${(scenarioStress! * 100).toFixed(0)}% exceeds the ${(threshold * 100).toFixed(0)}% threshold by ${(thresholdGap * 100).toFixed(0)}pp`}
                    </div>
                  </div>
                )}

                {sweepRow && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[
                      { label: 'Crises caught', value: `${(sweepRow.recall * 100).toFixed(0)}%` },
                      { label: 'False alarms',  value: `${(sweepRow.false_alert_rate * 100).toFixed(0)}%` },
                      { label: 'Avg warning',   value: `${sweepRow.avg_lead_time_days.toFixed(0)}d` },
                    ].map(m => (
                      <div
                        key={m.label}
                        className="rounded-lg p-2 text-center"
                        style={{ background: '#080b12', border: '1px solid #151d2e' }}
                      >
                        <div className="text-[8px] tracking-wide uppercase" style={{ color: '#4a6080' }}>{m.label}</div>
                        <div className="text-[14px] font-extrabold" style={{ color: '#94a3b8' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If `openSection` or `SectionHeader` still appear in remaining JSX, remove those references.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/ScenarioExplorer.tsx
git commit -m "feat(scenario): replace accordion with persistent preset strip, collapsible drivers, active/modified chip states"
```

---

### Task 4: Update existing smoke tests and verify full suite passes

**Files:**
- Modify: `frontend/tests/smoke/smoke.spec.ts`

Seven existing Scenario Explorer tests click old accordion section headers (`'Quick Scenarios'`, `'Alert Threshold'`). These buttons no longer exist.

- [ ] **Step 1: Update the 7 affected tests**

Replace the entire `'Scenario Explorer page'` describe block (lines 323–401) with the version below. The 4 new tests from Task 1 are already present; the 7 old tests are updated:

```typescript
// ─── Scenario Explorer page ──────────────────────────────────────────────────

test.describe('Scenario Explorer page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/scenario')
    await waitForLoad(page)
  })

  test('renders Scenario Explorer title', async ({ page }) => {
    await expect(page.getByText('Scenario Explorer').first()).toBeVisible()
  })

  test('all 6 driver sliders render (Drivers section open by default on desktop)', async ({ page }) => {
    await expect(page.getByText('VIX Level')).toBeVisible()
    await expect(page.getByText('VIX 5-day Change')).toBeVisible()
    await expect(page.getByText('Realized Vol Percentile')).toBeVisible()
    await expect(page.getByText('Drawdown')).toBeVisible()
    await expect(page.getByText('20-day Return')).toBeVisible()
    await expect(page.getByText('Distance from SMA-50')).toBeVisible()
  })

  test('preset chip strip is visible without opening any section', async ({ page }) => {
    // Presets always visible — no section click required
    await expect(page.getByText('Calm Recovery')).toBeVisible()
    await expect(page.getByText('Volatility Pickup')).toBeVisible()
    await expect(page.getByText('Panic Shock')).toBeVisible()
  })

  test('Alert Threshold section renders metric cards without any section click', async ({ page }) => {
    // Threshold always visible — no accordion click needed
    await expect(page.getByText(/Crises caught|False alarms|Avg warning/i).first()).toBeVisible()
  })

  test('Regime probability tripod panel renders with Calm/Turbulent tiles', async ({ page }) => {
    await expect(page.getByText('Regime probability — current market → your scenario')).toBeVisible()
    await expect(page.getByText(/calm/i).first()).toBeVisible()
    await expect(page.getByText(/turbulent/i).first()).toBeVisible()
  })

  test('"What\'s driving this scenario" driver panel renders', async ({ page }) => {
    await expect(page.getByText("What's driving this scenario")).toBeVisible()
  })

  test('Calm Recovery preset updates values without error', async ({ page }) => {
    await page.getByText('🌤 Calm Recovery').click()
    await waitForLoad(page)
    await expect(page.locator('text=error', { exact: false }).first()).toHaveCount(0)
  })

  test('Panic Shock preset updates values without error', async ({ page }) => {
    await page.getByText('⚡ Panic Shock').click()
    await waitForLoad(page)
    await expect(page.getByText('Regime probability — current market → your scenario')).toBeVisible()
  })

  test('Crisis Peak preset updates values without error', async ({ page }) => {
    await page.getByText('🔴 Crisis Peak').click()
    await waitForLoad(page)
    await expect(page.getByText('Regime probability — current market → your scenario')).toBeVisible()
  })

  test('Crisis Peak preset renders tripod with Turbulent regime visible', async ({ page }) => {
    await page.getByText('🔴 Crisis Peak').click()
    await waitForLoad(page)
    await expect(page.getByText('Regime probability — current market → your scenario')).toBeVisible()
    await expect(page.getByText('Turbulent').first()).toBeVisible()
  })

  test('Reset to current market button works', async ({ page }) => {
    await page.getByText('🔴 Crisis Peak').click()
    await waitForLoad(page)
    await page.getByText('↺ Reset to current market').click()
    await waitForLoad(page)
    await expect(page.getByText('Regime probability — current market → your scenario')).toBeVisible()
  })

  test('customized indicator appears after clicking preset then moving a slider', async ({ page }) => {
    const done = page.waitForResponse(
      r => r.url().includes('/scenario') && r.status() === 200,
      { timeout: 15_000 },
    )
    await page.goto('/scenario')
    await done
    await page.waitForTimeout(400)
    await page.getByText('Calm Recovery').click()
    await page.waitForTimeout(400)
    await page.locator('input[type="range"]').first().evaluate((el: HTMLInputElement) => {
      el.value = String(parseFloat(el.max) * 0.8)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    await expect(page.getByText(/Modified from/)).toBeVisible()
  })

  test('inline reset button in customized state returns chip to untouched', async ({ page }) => {
    const done = page.waitForResponse(
      r => r.url().includes('/scenario') && r.status() === 200,
      { timeout: 15_000 },
    )
    await page.goto('/scenario')
    await done
    await page.waitForTimeout(400)
    await page.getByText('Calm Recovery').click()
    await page.waitForTimeout(400)
    await page.locator('input[type="range"]').first().evaluate((el: HTMLInputElement) => {
      el.value = String(parseFloat(el.max) * 0.8)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    await expect(page.getByText(/Modified from/)).toBeVisible()
    await page.getByRole('button', { name: /↺ reset/i }).last().click()
    await page.waitForTimeout(300)
    await expect(page.getByText(/Modified from/)).not.toBeVisible()
  })

  test('Drivers section can be toggled collapsed and re-expanded', async ({ page }) => {
    await expect(page.locator('input[type="range"]').first()).toBeVisible()
    await page.getByRole('button', { name: /Drivers/i }).click()
    await page.waitForTimeout(250)
    await expect(page.locator('input[type="range"]').first()).not.toBeVisible()
    await page.getByRole('button', { name: /Drivers/i }).click()
    await page.waitForTimeout(250)
    await expect(page.locator('input[type="range"]').first()).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the full smoke suite and verify all tests pass**

Ensure the dev server and API backend are both running (`npm run dev` in `frontend/`, Python API on port 8000), then:

```bash
cd frontend && npx playwright test tests/smoke/smoke.spec.ts --reporter=line 2>&1 | tail -30
```

Expected: all tests pass. If any Scenario Explorer test fails, check the selector — the most common issue is `getByRole('button', { name: /Drivers/i })` not matching if the button text changed.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/smoke/smoke.spec.ts
git commit -m "test(scenario): update smoke tests for redesigned left column — persistent presets, collapsible drivers, customized state"
```
