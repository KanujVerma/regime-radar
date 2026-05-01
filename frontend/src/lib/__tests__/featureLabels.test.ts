import { describe, it, expect } from 'vitest'
import { sentenceFor, narrativeFragmentFor } from '../featureLabels'

describe('sentenceFor', () => {
  it('returns up sentence for drawdown', () => {
    expect(sentenceFor('drawdown_pct_504d', 'up')).toBe('SPY has pulled back from its 2-year high')
  })
  it('returns down sentence for drawdown', () => {
    expect(sentenceFor('drawdown_pct_504d', 'down')).toBe('SPY is near its 2-year high')
  })
  it('returns up sentence for rv_20d', () => {
    expect(sentenceFor('rv_20d', 'up')).toBe('Recent realized volatility has been high')
  })
  it('returns down sentence for rv_20d', () => {
    expect(sentenceFor('rv_20d', 'down')).toBe('Recent realized volatility has been low')
  })
  it('returns up sentence for ret_20d', () => {
    expect(sentenceFor('ret_20d', 'up')).toBe("SPY's 20-day return has been weak")
  })
  it('returns down sentence for ret_20d', () => {
    expect(sentenceFor('ret_20d', 'down')).toBe('SPY is up over the past 20 trading days')
  })
  it('returns tightened up sentence for days_in_regime_lag1', () => {
    expect(sentenceFor('days_in_regime_lag1', 'up')).toBe('These conditions have lasted longer than usual')
  })
  it('returns tightened up sentence for trend_code', () => {
    expect(sentenceFor('trend_code', 'up')).toBe("SPY's recent trend has turned negative")
  })
  it('returns tightened down sentence for trend_code', () => {
    expect(sentenceFor('trend_code', 'down')).toBe("SPY's recent trend remains positive")
  })
  it('falls back to feature key for unknown features', () => {
    expect(sentenceFor('unknown_feature_xyz', 'up')).toBe('unknown_feature_xyz')
  })
})

describe('narrativeFragmentFor', () => {
  it('returns noun phrase for drawdown up', () => {
    expect(narrativeFragmentFor('drawdown_pct_504d', 'up')).toBe('a pullback from the 2-year high')
  })
  it('returns noun phrase for emv_level up', () => {
    expect(narrativeFragmentFor('emv_level', 'up')).toBe('a rising equity market volatility index')
  })
  it('returns noun phrase for ret_20d down', () => {
    expect(narrativeFragmentFor('ret_20d', 'down')).toBe('positive 20-day momentum')
  })
  it('returns noun phrase for rv_20d down', () => {
    expect(narrativeFragmentFor('rv_20d', 'down')).toBe('low realized volatility')
  })
  it('falls back to lowercase label for unknown features', () => {
    expect(narrativeFragmentFor('unknown_xyz', 'up')).toBe('unknown_xyz')
  })
})
