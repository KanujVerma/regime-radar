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
    expect(result).toContain('firmer volatility backdrop')
  })

  it('includes pushing sentence when risk is exactly 0.40', () => {
    const result = buildDriversNarrative('elevated', 0.40, ['drawdown_pct_504d'], [])
    expect(result).toContain('pullback from the 2-year high')
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

  it('uses correct article "an" for elevated regime', () => {
    const result = buildDriversNarrative('elevated', 0.30, [], [])
    expect(result).toContain('in an elevated state')
    expect(result).not.toContain('in a elevated')
  })
})

import { detectScenarioCharacter, buildScenarioVerdict } from '../narratives'

describe('detectScenarioCharacter', () => {
  it('returns sharp-shock when vix_chg_5d >= 5 AND ret_20d <= -0.07', () => {
    expect(detectScenarioCharacter({
      vix_level: 45, vix_chg_5d: 5, rv_20d_pct: 0.9,
      drawdown_pct_504d: 0.3, ret_20d: -0.07, dist_sma50: -0.05,
    })).toBe('sharp-shock')
  })

  it('requires BOTH conditions for sharp-shock — high vix_chg + positive return is neutral', () => {
    expect(detectScenarioCharacter({
      vix_level: 45, vix_chg_5d: 6, rv_20d_pct: 0.9,
      drawdown_pct_504d: 0.3, ret_20d: 0.01, dist_sma50: -0.05,
    })).toBe('neutral')
  })

  it('returns slow-grind when vix_chg_5d <= 2 AND drawdown_pct_504d >= 0.25', () => {
    expect(detectScenarioCharacter({
      vix_level: 28, vix_chg_5d: 1, rv_20d_pct: 0.78,
      drawdown_pct_504d: 0.25, ret_20d: -0.08, dist_sma50: -0.06,
    })).toBe('slow-grind')
  })

  it('requires BOTH conditions for slow-grind — low chg but shallow drawdown is neutral', () => {
    expect(detectScenarioCharacter({
      vix_level: 28, vix_chg_5d: 1, rv_20d_pct: 0.78,
      drawdown_pct_504d: 0.10, ret_20d: -0.08, dist_sma50: -0.06,
    })).toBe('neutral')
  })

  it('returns neutral for normal conditions', () => {
    expect(detectScenarioCharacter({
      vix_level: 18, vix_chg_5d: 0, rv_20d_pct: 0.40,
      drawdown_pct_504d: 0.05, ret_20d: 0.01, dist_sma50: 0.01,
    })).toBe('neutral')
  })
})

describe('buildScenarioVerdict', () => {
  it('returns Unavailable when probCalm is NaN', () => {
    const result = buildScenarioVerdict(NaN, 0.5, 0.1, 'VIX Level')
    expect(result.badgeLabel).toBe('Unavailable')
    expect(result.sentence).toContain('not available')
  })

  it('returns Calm badge when probCalm >= 0.70', () => {
    const result = buildScenarioVerdict(0.80, 0.18, 0.02, 'VIX Level')
    expect(result.badgeLabel).toBe('Calm')
    expect(result.sentence).toContain('calm')
    expect(result.badgeColor).toBe('#4ade80')
  })

  it('returns Mild stress badge when probCalm is between 0.40 and 0.70', () => {
    const result = buildScenarioVerdict(0.55, 0.43, 0.02, 'VIX Level')
    expect(result.badgeLabel).toBe('Mild stress')
    expect(result.sentence).toContain('VIX Level')
    expect(result.badgeColor).toBe('#06b6d4')
  })

  it('returns Elevated stress for elevated tier with neutral character', () => {
    const result = buildScenarioVerdict(0.30, 0.68, 0.015, 'Realized vol', 'neutral')
    expect(result.badgeLabel).toBe('Elevated stress')
    expect(result.sentence).toContain('Elevated')
    expect(result.badgeColor).toBe('#fbbf24')
  })

  it('uses sharp-shock sentence when character is sharp-shock', () => {
    const result = buildScenarioVerdict(0.30, 0.68, 0.015, 'VIX Level', 'sharp-shock')
    expect(result.badgeLabel).toBe('Elevated stress')
    expect(result.sentence).toContain('sharp')
  })

  it('uses slow-grind sentence and mentions topDriverLabel when character is slow-grind', () => {
    const result = buildScenarioVerdict(0.30, 0.68, 0.015, 'Drawdown', 'slow-grind')
    expect(result.badgeLabel).toBe('Elevated stress')
    expect(result.sentence).toContain('slow deterioration')
    expect(result.sentence).toContain('Drawdown')
  })

  it('returns High stress for strongly-elevated tier (probCalm < 0.15, probTurbulent < 0.02)', () => {
    const result = buildScenarioVerdict(0.05, 0.94, 0.01, 'VIX Level')
    expect(result.badgeLabel).toBe('High stress')
    expect(result.sentence).toContain('VIX Level')
    expect(result.badgeColor).toBe('#f97316')
  })

  it('returns Elevated + turbulent when probTurbulent is between 0.02 and 0.50', () => {
    const result = buildScenarioVerdict(0.10, 0.87, 0.03, 'VIX Level')
    expect(result.badgeLabel).toBe('Elevated + turbulent')
    expect(result.sentence).toContain('Turbulent risk')
    expect(result.badgeColor).toBe('#f87171')
  })

  it('returns Turbulent badge when probTurbulent >= 0.50 (turbulent-dominant)', () => {
    const result = buildScenarioVerdict(0.001, 0.38, 0.62, 'Drawdown Severity')
    expect(result.badgeLabel).toBe('Turbulent')
    expect(result.sentence).toContain('crisis already underway')
    expect(result.sentence).toContain('repeated recent turbulence')
    expect(result.badgeColor).toBe('#f87171')
  })

  it('turbulent-dominant takes priority over strongly-elevated when turbulent >= 0.50', () => {
    const result = buildScenarioVerdict(0.001, 0.49, 0.51, 'VIX Level')
    expect(result.badgeLabel).toBe('Turbulent')
  })

  it('all badge styles are populated (no undefined colors)', () => {
    const cases: [number, number, number][] = [
      [0.80, 0.18, 0.02],
      [0.55, 0.43, 0.02],
      [0.30, 0.68, 0.015],
      [0.05, 0.94, 0.01],
      [0.10, 0.87, 0.03],
      [0.001, 0.38, 0.62],
    ]
    cases.forEach(([pc, pe, pt]) => {
      const r = buildScenarioVerdict(pc, pe, pt, 'VIX')
      expect(r.badgeColor).toMatch(/^#[0-9a-f]{6}$/i)
      expect(r.badgeBg).toMatch(/^#[0-9a-f]{6}$/i)
      expect(r.badgeBorder).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })

  it('character defaults to neutral when omitted', () => {
    const withChar = buildScenarioVerdict(0.30, 0.68, 0.01, 'VIX', 'neutral')
    const withoutChar = buildScenarioVerdict(0.30, 0.68, 0.01, 'VIX')
    expect(withoutChar.sentence).toBe(withChar.sentence)
  })
})
