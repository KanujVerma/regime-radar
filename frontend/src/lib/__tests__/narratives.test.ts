import { describe, it, expect } from 'vitest'
import { buildDriversNarrative, getDriverHeadline } from '../narratives'

describe('getDriverHeadline', () => {
  it('returns calm headline', () => {
    expect(getDriverHeadline('calm')).toBe('Conditions improved, but the model is still cautious')
  })
  it('returns elevated headline', () => {
    expect(getDriverHeadline('elevated')).toBe('Elevated conditions — the model is watching several factors')
  })
  it('returns turbulent headline', () => {
    expect(getDriverHeadline('turbulent')).toBe('Turbulent conditions — the model is registering significant stress signals')
  })
  it('is case-insensitive', () => {
    expect(getDriverHeadline('Calm')).toBe('Conditions improved, but the model is still cautious')
  })
  it('falls back gracefully for unknown regime', () => {
    expect(getDriverHeadline('unknown')).toBe('Current conditions: unknown')
  })
})

describe('buildDriversNarrative', () => {
  it('uses generic opening when no prior regime provided', () => {
    const result = buildDriversNarrative('calm', 0.15, [], [])
    expect(result).toContain('currently in a calm state')
  })

  it('uses transition opening when prior regime is confirmed different', () => {
    const result = buildDriversNarrative('calm', 0.45, [], [], 'elevated')
    expect(result).toContain('shifted to calm')
  })

  it('does NOT use transition opening when prior regime matches current', () => {
    const result = buildDriversNarrative('calm', 0.15, [], [], 'calm')
    expect(result).toContain('currently in a calm state')
    expect(result).not.toContain('shifted')
  })

  it('uses narrative fragment (not label) for single pushing feature', () => {
    const result = buildDriversNarrative('elevated', 0.63, ['drawdown_pct_504d'], [])
    expect(result).toContain('pullback from the 2-year high')
    expect(result).not.toContain('Drawdown relative to 2-year high')
  })

  it('combines two pushing fragments naturally', () => {
    const result = buildDriversNarrative('elevated', 0.63, ['drawdown_pct_504d', 'emv_level'], [])
    expect(result).toContain('pullback from the 2-year high')
    expect(result).toContain('rising equity market volatility index')
  })

  it('does NOT include pushing sentence when pushing features are empty', () => {
    const result = buildDriversNarrative('elevated', 0.63, [], [])
    expect(result).not.toContain('keeping the model cautious')
  })

  it('adds stability sentence when calm and risk < 0.20', () => {
    const result = buildDriversNarrative('calm', 0.10, [], [])
    expect(result).toContain('few notable stress signals')
  })

  it('does NOT add stability sentence when risk >= 0.20', () => {
    const result = buildDriversNarrative('calm', 0.25, [], [])
    expect(result).not.toContain('few notable stress signals')
  })

  it('adds offset sentence using narrative fragment for single holding feature', () => {
    const result = buildDriversNarrative('elevated', 0.50, [], ['ret_20d'])
    expect(result).toContain('positive 20-day momentum')
    expect(result).not.toContain('20-day SPY return')
  })

  it('combines two holding fragments in offset sentence', () => {
    const result = buildDriversNarrative('calm', 0.45, [], ['ret_20d', 'rv_20d'])
    expect(result).toContain('positive 20-day momentum')
    expect(result).toContain('low realized volatility')
  })
})
