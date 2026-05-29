import { describe, expect, it } from 'vitest'
import {
  buildMarketContextCards,
  buildRiskTemperature,
  buildStressLadderRows,
  buildWhatChangedRows,
  classifyRegimePersistence,
  percentileRank,
} from './currentStateBriefing'
import type { CurrentStateResponse, DailyDiffResponse, HistoricalPoint } from '../types/api'

const historical: HistoricalPoint[] = [
  { date: '2026-05-20', regime: 'calm', transition_risk: 0.05, vix_level: 14, close: 520 },
  { date: '2026-05-21', regime: 'calm', transition_risk: 0.10, vix_level: 15, close: 522 },
  { date: '2026-05-22', regime: 'elevated', transition_risk: 0.20, vix_level: 20, close: 518 },
  { date: '2026-05-23', regime: 'elevated', transition_risk: 0.40, vix_level: 28, close: 510 },
]

const current: CurrentStateResponse = {
  regime: 'elevated',
  transition_risk: 0.20,
  trend: 'neutral',
  vix_level: 22,
  vix_chg_1d: 2,
  top_drivers: [
    { feature: 'vix_level', importance: 0.4 },
    { feature: 'rv_20d_pct', importance: 0.25 },
  ],
  as_of_ts: '2026-05-29T00:00:00Z',
  mode: 'real',
  prob_calm: 0.45,
  prob_elevated: 0.40,
  prob_turbulent: 0.15,
  delta: {
    risk_delta: 0.08,
    regime_changed: true,
    prior_regime: 'calm',
    top_feature_moved: 'vix_level',
    top_feature_direction: 'up',
  },
  condition_values: {
    vix_level: 22,
    vix_chg_5d: 3,
    rv_20d_pct: 0.55,
    drawdown_pct_504d: 0.12,
    ret_20d: 0.01,
    dist_sma50: -0.01,
  },
}

const dailyDiff: DailyDiffResponse = {
  current: {
    as_of_date: '2026-05-29',
    generated_at: '2026-05-29T01:00:00Z',
    data_through_date: '2026-05-28',
    regime: 'elevated',
    transition_risk: 0.20,
    prob_calm: 0.45,
    prob_elevated: 0.40,
    prob_turbulent: 0.15,
    vix_level: 22,
    trend: 'neutral',
    top_drivers: [{ feature: 'vix_level', plain_label: 'VIX Level', importance: 0.4 }],
    model_version: {
      transition_model: 'transition-v1',
      transition_trained_as_of: '2026-05-01',
      regime_model: 'regime-v1',
      regime_trained_as_of: '2026-05-01',
    },
  },
  previous: {
    as_of_date: '2026-05-28',
    generated_at: '2026-05-28T01:00:00Z',
    data_through_date: '2026-05-27',
    regime: 'calm',
    transition_risk: 0.12,
    prob_calm: 0.65,
    prob_elevated: 0.25,
    prob_turbulent: 0.10,
    vix_level: 20,
    trend: 'uptrend',
    top_drivers: [{ feature: 'vix_level', plain_label: 'VIX Level', importance: 0.35 }],
    model_version: {
      transition_model: 'transition-v1',
      transition_trained_as_of: '2026-05-01',
      regime_model: 'regime-v1',
      regime_trained_as_of: '2026-05-01',
    },
  },
  diff: {
    regime_changed: true,
    prior_regime: 'calm',
    risk_delta: 0.08,
    vix_delta: 2,
    trend_changed: true,
    prior_trend: 'uptrend',
    top_driver_changed: false,
    prior_top_driver: { feature: 'vix_level', plain_label: 'VIX Level' },
    current_top_driver: { feature: 'vix_level', plain_label: 'VIX Level' },
  },
  metadata: {
    current_date: '2026-05-29',
    previous_date: '2026-05-28',
    gap_days: 1,
    is_stale: false,
  },
}

describe('current state briefing derivation helpers', () => {
  it('calculates transition risk percentile rank', () => {
    expect(percentileRank(0.20, historical)).toBe(75)
  })

  it('builds risk temperature from current risk and history', () => {
    expect(buildRiskTemperature(current.transition_risk, historical)).toEqual({
      currentRisk: 0.20,
      percentile: 75,
      label: 'Above normal',
    })
  })

  it('builds exactly the V1 what-changed rows in order', () => {
    const rows = buildWhatChangedRows(current, dailyDiff)

    expect(rows.map((row) => row.feature)).toEqual([
      'transition_risk',
      'regime',
      'vix_level',
      'trend',
    ])
    expect(rows).toHaveLength(4)
    expect(rows[0].direction).toBe('up')
    expect(rows[1].summary).toContain('Calm to Elevated')
    expect(rows[3].summary).toContain('Uptrend to Neutral')
  })

  it('builds directional stress ladder rows from slider config values', () => {
    const rows = buildStressLadderRows(current.condition_values, dailyDiff)
    const forbidden = /flip|trigger|breakpoint|regime changes/i

    expect(rows).toHaveLength(6)
    expect(rows[0].feature).toBe('vix_level')
    expect(rows[0].status).toBe('watch')
    expect(rows[0].watchHigher).toContain('likely add pressure')
    expect(rows[0].watchHigher).not.toMatch(forbidden)
    expect(rows[0].watchLower).toContain('likely ease pressure')
    expect(rows[0].watchLower).not.toMatch(forbidden)
  })

  it('classifies current regime persistence against prior completed runs', () => {
    const regimeHistory: HistoricalPoint[] = [
      { date: '2026-05-17', regime: 'elevated', transition_risk: 0.32, vix_level: 23, close: 500 },
      { date: '2026-05-18', regime: 'elevated', transition_risk: 0.30, vix_level: 22, close: 501 },
      { date: '2026-05-19', regime: 'elevated', transition_risk: 0.28, vix_level: 21, close: 502 },
      { date: '2026-05-20', regime: 'calm', transition_risk: 0.08, vix_level: 15, close: 510 },
      { date: '2026-05-21', regime: 'calm', transition_risk: 0.09, vix_level: 15, close: 512 },
      { date: '2026-05-22', regime: 'elevated', transition_risk: 0.20, vix_level: 20, close: 508 },
      { date: '2026-05-23', regime: 'elevated', transition_risk: 0.22, vix_level: 21, close: 507 },
    ]

    expect(classifyRegimePersistence('elevated', regimeHistory)).toEqual({
      daysInRegime: 2,
      label: 'Typical',
    })
  })

  it('keeps market context hidden when no cards exist', () => {
    expect(buildMarketContextCards([])).toEqual([])
  })

  it('caps market context cards to the first three in order', () => {
    const cards = [
      { title: 'Rates', body: 'Rates moved higher.' },
      { title: 'Credit', body: 'Spreads widened.' },
      { title: 'Breadth', body: 'Participation narrowed.' },
      { title: 'Macro', body: 'Growth data softened.' },
    ]

    expect(buildMarketContextCards(cards)).toEqual(cards.slice(0, 3))
  })
})
