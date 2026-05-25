import { describe, it, expect } from 'vitest'
import { roundToStep } from './ScenarioSlider'

describe('roundToStep', () => {
  it('snaps to nearest step for integer steps', () => {
    expect(roundToStep(18.3, 0.5)).toBe(18.5)
    expect(roundToStep(18.2, 0.5)).toBe(18.0)
    expect(roundToStep(18.0, 0.5)).toBe(18.0)
  })

  it('snaps for small decimal steps', () => {
    expect(roundToStep(0.401, 0.01)).toBeCloseTo(0.40, 10)
    expect(roundToStep(0.409, 0.01)).toBeCloseTo(0.41, 10)
  })

  it('snaps correctly at range boundaries', () => {
    expect(roundToStep(0.0, 0.01)).toBeCloseTo(0.0, 10)
    expect(roundToStep(1.0, 0.01)).toBeCloseTo(1.0, 10)
  })

  it('returns same value when already on a step', () => {
    expect(roundToStep(24.0, 0.5)).toBe(24.0)
    expect(roundToStep(0.40, 0.01)).toBeCloseTo(0.40, 10)
  })

  it('rounds up at exact midpoint (.5)', () => {
    expect(roundToStep(18.25, 0.5)).toBe(18.5)
  })
})

describe('isChanged detection (snapped comparison)', () => {
  // Simulates the component logic: isChanged = roundToStep(value, step) !== roundToStep(presetValue, step)
  function isChanged(value: number, presetValue: number, step: number): boolean {
    return roundToStep(value, step) !== roundToStep(presetValue, step)
  }

  it('returns false when value equals preset exactly', () => {
    expect(isChanged(18.0, 18.0, 0.5)).toBe(false)
  })

  it('returns false when difference is sub-step float noise', () => {
    // 18.0 + 0.0000001 should still snap to 18.0
    expect(isChanged(18.0000001, 18.0, 0.5)).toBe(false)
  })

  it('returns true when value is one step away', () => {
    expect(isChanged(18.5, 18.0, 0.5)).toBe(true)
  })

  it('returns true for percentile slider one step away', () => {
    expect(isChanged(0.41, 0.40, 0.01)).toBe(true)
  })

  it('returns false for percentile slider with sub-step noise', () => {
    expect(isChanged(0.400001, 0.40, 0.01)).toBe(false)
  })
})
