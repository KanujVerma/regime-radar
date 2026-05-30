export type CurrentStateConditionKey =
  | 'vix_level'
  | 'vix_chg_5d'
  | 'rv_20d_pct'
  | 'drawdown_pct_504d'
  | 'ret_20d'
  | 'dist_sma50'

export interface CurrentStateConditionConfig {
  key: CurrentStateConditionKey
  label: string
  calmMax: number
  stressMin: number
}

export const CURRENT_STATE_STRESS_LADDER_CONFIG: CurrentStateConditionConfig[] = [
  { key: 'vix_level', label: 'VIX Level', calmMax: 18, stressMin: 28 },
  { key: 'vix_chg_5d', label: 'VIX 5-day Change', calmMax: 0, stressMin: 5 },
  { key: 'rv_20d_pct', label: 'Realized Vol Percentile', calmMax: 0.40, stressMin: 0.70 },
  { key: 'drawdown_pct_504d', label: 'Drawdown Severity', calmMax: 0.10, stressMin: 0.30 },
  { key: 'ret_20d', label: '20-day Return', calmMax: 0.05, stressMin: -0.05 },
  { key: 'dist_sma50', label: 'Distance from SMA-50', calmMax: 0.02, stressMin: -0.02 },
]
