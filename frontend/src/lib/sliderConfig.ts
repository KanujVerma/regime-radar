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

export type ScenarioInputs = Record<SliderConfig['key'], number>

export const PRESETS: Record<string, ScenarioInputs> = {
  calm:   { vix_level: 13, vix_chg_5d: -1.0, rv_20d_pct: 0.25, drawdown_pct_504d: 0.02, ret_20d: 0.03, dist_sma50: 0.02 },
  choppy: { vix_level: 22, vix_chg_5d:  2.0, rv_20d_pct: 0.65, drawdown_pct_504d: 0.08, ret_20d: -0.01, dist_sma50: -0.01 },
  stress: { vix_level: 35, vix_chg_5d:  6.0, rv_20d_pct: 0.85, drawdown_pct_504d: 0.20, ret_20d: -0.08, dist_sma50: -0.06 },
}
