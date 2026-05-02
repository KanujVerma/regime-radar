export interface SliderConfig {
  key: 'vix_level' | 'vix_chg_5d' | 'rv_20d_pct' | 'drawdown_pct_504d' | 'ret_20d' | 'dist_sma50'
  label: string
  helper: string
  min: number
  max: number
  step: number
  calmMax: number
  stressMin: number
}

export const SLIDER_CONFIG: SliderConfig[] = [
  {
    key: 'vix_level', label: 'VIX Level',
    helper: 'Market fear gauge — higher = more fear',
    min: 5, max: 80, step: 0.5, calmMax: 18, stressMin: 28,
  },
  {
    key: 'vix_chg_5d', label: 'VIX 5-day Change',
    helper: 'How fast fear is rising or falling',
    min: -15, max: 15, step: 0.5, calmMax: 0, stressMin: 5,
  },
  {
    key: 'rv_20d_pct', label: 'Realized Vol Percentile',
    helper: 'How unusual recent volatility is vs. the past 2 years — 0.70 means jumpier than 70% of recent days',
    min: 0, max: 1, step: 0.01, calmMax: 0.40, stressMin: 0.70,
  },
  {
    key: 'drawdown_pct_504d', label: 'Drawdown Severity',
    helper: 'Percentile rank of today\'s pullback vs. the past 2 years — 0.80 means worse than 80% of recent trading days',
    min: 0, max: 1, step: 0.01, calmMax: 0.10, stressMin: 0.30,
  },
  {
    key: 'ret_20d', label: '20-day Return',
    helper: 'Recent price performance',
    min: -0.30, max: 0.30, step: 0.01, calmMax: 0.05, stressMin: -0.05,
  },
  {
    key: 'dist_sma50', label: 'Distance from SMA-50',
    helper: 'How far price is from its 50-day average',
    min: -0.15, max: 0.15, step: 0.005, calmMax: 0.02, stressMin: -0.02,
  },
]

export type ScenarioInputs = Record<SliderConfig['key'], number> & {
  days_in_regime_lag1?: number
  turbulent_count_30d_lag1?: number
}

export const PRESETS: Record<string, ScenarioInputs> = {
  calm_recovery: {
    vix_level: 13, vix_chg_5d: -1.0, rv_20d_pct: 0.20,
    drawdown_pct_504d: 0.02, ret_20d: 0.03, dist_sma50: 0.02,
    days_in_regime_lag1: 60, turbulent_count_30d_lag1: 0,
  },
  volatility_pickup: {
    vix_level: 22, vix_chg_5d: 4.0, rv_20d_pct: 0.62,
    drawdown_pct_504d: 0.10, ret_20d: -0.02, dist_sma50: -0.01,
    days_in_regime_lag1: 10, turbulent_count_30d_lag1: 1,
  },
  growth_scare: {
    vix_level: 24, vix_chg_5d: 2.0, rv_20d_pct: 0.72,
    drawdown_pct_504d: 0.20, ret_20d: -0.05, dist_sma50: -0.04,
    days_in_regime_lag1: 8, turbulent_count_30d_lag1: 3,
  },
  panic_shock: {
    vix_level: 45, vix_chg_5d: 10.0, rv_20d_pct: 0.95,
    drawdown_pct_504d: 0.65, ret_20d: -0.15, dist_sma50: -0.10,
    days_in_regime_lag1: 2, turbulent_count_30d_lag1: 3,
  },
  slow_deterioration: {
    vix_level: 28, vix_chg_5d: 1.0, rv_20d_pct: 0.78,
    drawdown_pct_504d: 0.45, ret_20d: -0.08, dist_sma50: -0.06,
    days_in_regime_lag1: 25, turbulent_count_30d_lag1: 6,
  },
  crisis_peak: {
    vix_level: 38, vix_chg_5d: 6.0, rv_20d_pct: 0.92,
    drawdown_pct_504d: 0.95, ret_20d: -0.10, dist_sma50: -0.08,
    days_in_regime_lag1: 14, turbulent_count_30d_lag1: 30,
  },
}
