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

const historyFromRisks = (risks: Array<number | null>): HistoricalPoint[] =>
  risks.map((transition_risk, index) => ({
    date: `2026-05-${String(index + 1).padStart(2, '0')}`,
    regime: 'calm',
    transition_risk,
    vix_level: 15,
    close: 500 + index,
  }))

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

  it('ignores null and non-finite transition risk values in percentile rank', () => {
    const mixedHistory = historyFromRisks([0.05, null, Number.NaN, 0.10, Infinity, 0.20, 0.40])

    expect(percentileRank(0.20, mixedHistory)).toBe(75)
  })

  it('returns null percentile rank when history has no valid risk values', () => {
    expect(percentileRank(0.20, historyFromRisks([null, Number.NaN, Infinity]))).toBeNull()
  })

  it('builds risk temperature from current risk and history', () => {
    expect(buildRiskTemperature(current.transition_risk, historical)).toEqual({
      currentRisk: 0.20,
      percentile: 75,
      label: 'Above normal',
    })
  })

  it('labels risk temperature thresholds', () => {
    expect(buildRiskTemperature(0.20, historyFromRisks([0.10, 0.20, 0.30, 0.40])).label).toBe('Normal')
    expect(buildRiskTemperature(0.20, historical).label).toBe('Above normal')
    expect(buildRiskTemperature(0.20, historyFromRisks([
      0.01, 0.02, 0.03, 0.04, 0.05,
      0.06, 0.07, 0.08, 0.20, 0.40,
    ])).label).toBe('Stretched')
    expect(buildRiskTemperature(0.20, historyFromRisks([
      0.01, 0.02, 0.03, 0.04, 0.05,
      0.06, 0.07, 0.08, 0.09, 0.10,
      0.11, 0.12, 0.13, 0.14, 0.15,
      0.16, 0.17, 0.18, 0.20, 0.40,
    ])).label).toBe('Extreme')
    expect(buildRiskTemperature(0.20, historyFromRisks([null, Number.NaN])).label).toBe('No history')
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

  it('keeps regime and trend directions flat when changed flags lack prior values', () => {
    const currentWithoutPrior: CurrentStateResponse = {
      ...current,
      delta: current.delta ? { ...current.delta, prior_regime: null } : null,
    }
    const diffWithoutPrior: DailyDiffResponse = {
      ...dailyDiff,
      diff: {
        ...dailyDiff.diff,
        prior_regime: null,
        prior_trend: null,
        regime_changed: true,
        trend_changed: true,
      },
    }
    const rows = buildWhatChangedRows(currentWithoutPrior, diffWithoutPrior)
    const regimeRow = rows.find((row) => row.feature === 'regime')
    const trendRow = rows.find((row) => row.feature === 'trend')

    expect(regimeRow?.summary).toBe('No regime change')
    expect(regimeRow?.direction).toBe('flat')
    expect(trendRow?.summary).toBe('No trend change')
    expect(trendRow?.direction).toBe('flat')
  })

  it('handles unavailable VIX in what-changed rows', () => {
    const rows = buildWhatChangedRows({ ...current, vix_level: null }, {
      ...dailyDiff,
      diff: { ...dailyDiff.diff, vix_delta: null },
    })
    const vixRow = rows.find((row) => row.feature === 'vix_level')

    expect(vixRow?.value).toBe('Unavailable')
    expect(vixRow?.summary).toBe('Latest VIX change unavailable')
    expect(vixRow?.direction).toBe('flat')
  })

  it('builds directional stress ladder rows from current-state condition config values', () => {
    const rows = buildStressLadderRows(current.condition_values, dailyDiff)
    const forbidden = /\bwill\b|flip|trigger|breakpoint|regime changes|likely/i

    expect(rows).toHaveLength(6)
    expect(rows[0].feature).toBe('vix_level')
    expect(rows[0].status).toBe('watch')
    expect(rows[0].watchHigher).toContain('points toward more pressure')
    expect(rows[0].watchHigher).not.toMatch(forbidden)
    expect(rows[0].watchLower).toContain('points toward less pressure')
    expect(rows[0].watchLower).not.toMatch(forbidden)
  })

  it('uses inverted stress ladder scales where lower values are more stressful', () => {
    const forbidden = /\bwill\b|flip|trigger|breakpoint|regime changes|likely/i
    const [row] = buildStressLadderRows({ ret_20d: -0.10 }, null)

    expect(row.feature).toBe('ret_20d')
    expect(row.status).toBe('stress')
    expect(row.watchHigher).toContain('points toward less pressure')
    expect(row.watchHigher).not.toMatch(forbidden)
    expect(row.watchLower).toContain('points toward more pressure')
    expect(row.watchLower).not.toMatch(forbidden)
  })

  it('sets VIX delta only on the VIX stress ladder row', () => {
    const rows = buildStressLadderRows(current.condition_values, dailyDiff)

    expect(rows.find((row) => row.feature === 'vix_level')?.delta).toBe(2)
    expect(rows.filter((row) => row.feature !== 'vix_level').every((row) => row.delta === null)).toBe(true)
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

  it('returns null regime persistence when history is empty', () => {
    expect(classifyRegimePersistence('elevated', [])).toBeNull()
  })

  it('classifies short regime persistence', () => {
    const regimeHistory: HistoricalPoint[] = [
      { date: '2026-05-17', regime: 'elevated', transition_risk: 0.32, vix_level: 23, close: 500 },
      { date: '2026-05-18', regime: 'elevated', transition_risk: 0.30, vix_level: 22, close: 501 },
      { date: '2026-05-19', regime: 'elevated', transition_risk: 0.28, vix_level: 21, close: 502 },
      { date: '2026-05-20', regime: 'elevated', transition_risk: 0.26, vix_level: 20, close: 503 },
      { date: '2026-05-21', regime: 'elevated', transition_risk: 0.24, vix_level: 19, close: 504 },
      { date: '2026-05-22', regime: 'elevated', transition_risk: 0.22, vix_level: 18, close: 505 },
      { date: '2026-05-23', regime: 'calm', transition_risk: 0.08, vix_level: 15, close: 510 },
      { date: '2026-05-24', regime: 'elevated', transition_risk: 0.20, vix_level: 20, close: 508 },
    ]

    expect(classifyRegimePersistence('elevated', regimeHistory)).toEqual({
      daysInRegime: 1,
      label: 'Short',
    })
  })

  it('classifies stretched regime persistence', () => {
    const regimeHistory: HistoricalPoint[] = [
      { date: '2026-05-14', regime: 'elevated', transition_risk: 0.32, vix_level: 23, close: 500 },
      { date: '2026-05-15', regime: 'elevated', transition_risk: 0.30, vix_level: 22, close: 501 },
      { date: '2026-05-16', regime: 'elevated', transition_risk: 0.28, vix_level: 21, close: 502 },
      { date: '2026-05-17', regime: 'calm', transition_risk: 0.08, vix_level: 15, close: 510 },
      { date: '2026-05-18', regime: 'elevated', transition_risk: 0.20, vix_level: 20, close: 508 },
      { date: '2026-05-19', regime: 'elevated', transition_risk: 0.22, vix_level: 21, close: 507 },
      { date: '2026-05-20', regime: 'elevated', transition_risk: 0.24, vix_level: 22, close: 506 },
      { date: '2026-05-21', regime: 'elevated', transition_risk: 0.26, vix_level: 23, close: 505 },
      { date: '2026-05-22', regime: 'elevated', transition_risk: 0.28, vix_level: 24, close: 504 },
      { date: '2026-05-23', regime: 'elevated', transition_risk: 0.30, vix_level: 25, close: 503 },
    ]

    expect(classifyRegimePersistence('elevated', regimeHistory)).toEqual({
      daysInRegime: 6,
      label: 'Stretched',
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
