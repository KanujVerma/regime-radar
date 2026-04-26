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
    helper: 'How unusually jumpy the market has been',
    min: 0, max: 1, step: 0.01, calmMax: 0.40, stressMin: 0.70,
  },
  {
    key: 'drawdown_pct_504d', label: 'Drawdown',
    helper: 'How far prices have fallen from a recent high',
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
  // calm: quiet bull market — low vol, long streak in calm regime
  calm:   { vix_level: 13, vix_chg_5d: -1.0, rv_20d_pct: 0.20, drawdown_pct_504d: 0.02, ret_20d: 0.03, dist_sma50: 0.02, days_in_regime_lag1: 60, turbulent_count_30d_lag1: 0 },
  // choppy: elevated stress, meaningful turbulent probability
  choppy: { vix_level: 28, vix_chg_5d:  4.0, rv_20d_pct: 0.90, drawdown_pct_504d: 0.50, ret_20d: -0.05, dist_sma50: -0.04, days_in_regime_lag1: 8, turbulent_count_30d_lag1: 8 },
  // stress: severe spike — high vol, deep drawdown, fresh turbulent entry
  stress: { vix_level: 45, vix_chg_5d: 10.0, rv_20d_pct: 0.95, drawdown_pct_504d: 0.70, ret_20d: -0.15, dist_sma50: -0.10, days_in_regime_lag1: 2, turbulent_count_30d_lag1: 3 },
}
