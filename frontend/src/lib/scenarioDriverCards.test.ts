import { describe, it, expect } from 'vitest'
import {
  isActiveDriverState,
  selectDriverCards,
  getChangedInputPills,
} from './scenarioDriverCards'
import type { DriverDelta } from '../types/api'
import type { SliderConfig, ScenarioInputs } from './sliderConfig'

const d = (feature: string, delta_value: number): DriverDelta => ({
  feature,
  plain_label: feature,
  delta_value,
})

const MINI_SLIDER_CONFIG: SliderConfig[] = [
  { key: 'vix_level', label: 'VIX Level', helper: '', min: 5, max: 80, step: 0.5, calmMax: 18, stressMin: 28 },
  { key: 'ret_20d', label: '20-day Return', helper: '', min: -0.3, max: 0.3, step: 0.01, calmMax: 0.05, stressMin: -0.05 },
] as SliderConfig[]

const BASELINE = { vix_level: 15.2, ret_20d: 0.04 }

const baseInputs = (overrides: Partial<ScenarioInputs> = {}): ScenarioInputs =>
  ({
    vix_level: 15.2,
    vix_chg_5d: 0,
    rv_20d_pct: 0,
    drawdown_pct_504d: 0,
    ret_20d: 0.04,
    dist_sma50: 0,
    ...overrides,
  } as ScenarioInputs)

// ── isActiveDriverState ───────────────────────────────────────────────────────

describe('isActiveDriverState', () => {
  it('returns false when all deltas are below 0.03', () => {
    expect(isActiveDriverState([d('a', 0.01), d('b', 0.02)])).toBe(false)
  })

  it('returns true when any delta meets 0.03', () => {
    expect(isActiveDriverState([d('a', 0.01), d('b', 0.03)])).toBe(true)
  })

  it('returns false for empty array', () => {
    expect(isActiveDriverState([])).toBe(false)
  })

  it('uses absolute value — negative deltas count', () => {
    expect(isActiveDriverState([d('a', -0.05)])).toBe(true)
  })
})

// ── selectDriverCards ─────────────────────────────────────────────────────────

describe('selectDriverCards', () => {
  it('returns all nulls for empty input', () => {
    expect(selectDriverCards([])).toEqual({ primary: null, secondary: null, offset: null })
  })

  it('picks the largest |delta_value| as primary', () => {
    const { primary } = selectDriverCards([d('a', 0.1), d('b', 0.5), d('c', 0.3)])
    expect(primary?.feature).toBe('b')
  })

  it('secondary shares sign with primary and meets 0.03 threshold', () => {
    const { secondary } = selectDriverCards([d('a', 0.5), d('b', 0.04), d('c', -0.2)])
    expect(secondary?.feature).toBe('b')
  })

  it('secondary is null when second same-sign delta is below 0.03', () => {
    const { secondary } = selectDriverCards([d('a', 0.5), d('b', 0.02), d('c', -0.2)])
    expect(secondary).toBeNull()
  })

  it('offset has opposite sign to primary and meets 0.01 threshold', () => {
    const { offset } = selectDriverCards([d('a', 0.5), d('b', 0.3), d('c', -0.05)])
    expect(offset?.feature).toBe('c')
  })

  it('offset is null when opposite-sign delta is below 0.01', () => {
    const { offset } = selectDriverCards([d('a', 0.5), d('c', -0.005)])
    expect(offset).toBeNull()
  })

  it('handles calm scenario where primary has negative delta', () => {
    const { primary, secondary, offset } = selectDriverCards([
      d('vix_level', -0.4),
      d('drawdown', -0.2),
      d('ret', 0.1),
    ])
    expect(primary?.feature).toBe('vix_level')
    expect(secondary?.feature).toBe('drawdown')
    expect(offset?.feature).toBe('ret')
  })

  it('offset uses the opposite-sign entry with the largest |delta_value|', () => {
    const { offset } = selectDriverCards([d('a', 0.5), d('b', -0.3), d('c', -0.1)])
    expect(offset?.feature).toBe('b')
  })

  it('returns all nulls when primary delta is below active threshold', () => {
    expect(selectDriverCards([d('a', 0.02), d('b', 0.01)])).toEqual({
      primary: null, secondary: null, offset: null,
    })
  })

  it('returns primary + null secondary + offset when no same-sign secondary qualifies', () => {
    // primary exists, b is same-sign but below 0.03, c is opposite-sign above 0.01
    const { primary, secondary, offset } = selectDriverCards([
      d('a', 0.5),
      d('b', 0.02),
      d('c', -0.05),
    ])
    expect(primary?.feature).toBe('a')
    expect(secondary).toBeNull()
    expect(offset?.feature).toBe('c')
  })
})

// ── getChangedInputPills ──────────────────────────────────────────────────────

describe('getChangedInputPills', () => {
  it('returns empty when nothing changed', () => {
    const result = getChangedInputPills(baseInputs(), BASELINE, MINI_SLIDER_CONFIG)
    expect(result).toHaveLength(0)
  })

  it('returns a pill for a changed input', () => {
    const result = getChangedInputPills(
      baseInputs({ vix_level: 18.3 }),
      BASELINE,
      MINI_SLIDER_CONFIG,
    )
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('vix_level')
    expect(result[0].label).toBe('VIX Level')
    expect(result[0].delta).toBeCloseTo(3.1)
  })

  it('filters out floating-point noise below 0.001', () => {
    const result = getChangedInputPills(
      baseInputs({ vix_level: 15.2000001 }),
      BASELINE,
      MINI_SLIDER_CONFIG,
    )
    expect(result).toHaveLength(0)
  })

  it('filters out delta at or below the 0.001 boundary', () => {
    // baseline 15.2, scenario 15.2001 → delta ≈ 0.0001, filtered (below 0.001)
    const result = getChangedInputPills(
      baseInputs({ vix_level: 15.2001 }),
      BASELINE,
      MINI_SLIDER_CONFIG,
    )
    expect(result).toHaveLength(0)
  })

  it('includes delta just above the 0.001 boundary', () => {
    // baseline 15.2, scenario 15.201 → delta ≈ 0.00100...012, passes (above 0.001)
    const result = getChangedInputPills(
      baseInputs({ vix_level: 15.201 }),
      BASELINE,
      MINI_SLIDER_CONFIG,
    )
    expect(result).toHaveLength(1)
  })

  it('reports correct sign for negative delta', () => {
    const result = getChangedInputPills(
      baseInputs({ ret_20d: 0.01 }),
      BASELINE,
      MINI_SLIDER_CONFIG,
    )
    expect(result[0].delta).toBeCloseTo(-0.03)
  })

  it('only returns pills for keys present in sliderConfig', () => {
    const result = getChangedInputPills(
      baseInputs({ vix_level: 20, vix_chg_5d: 5 }),
      { ...BASELINE, vix_chg_5d: 0 },
      MINI_SLIDER_CONFIG, // only has vix_level and ret_20d
    )
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('vix_level')
  })
})
