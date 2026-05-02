export interface HealthResponse {
  status: string
  mode: string
  as_of_ts?: string | null
}

export interface DriverItem {
  feature: string
  importance: number
}

export interface StateDelta {
  risk_delta: number
  regime_changed: boolean
  prior_regime: string | null
  top_feature_moved: string | null
  top_feature_direction: 'up' | 'down' | null
}

export interface CurrentStateResponse {
  regime: string
  transition_risk: number
  trend: string
  vix_level: number | null
  vix_chg_1d: number | null
  top_drivers: DriverItem[]
  as_of_ts: string
  mode: string
  prob_calm: number | null
  prob_elevated: number | null
  prob_turbulent: number | null
  delta: StateDelta | null
}

export interface HistoricalPoint {
  date: string
  regime: string
  transition_risk: number | null
  vix_level: number | null
  close: number | null
}

export interface HistoricalStateResponse {
  data: HistoricalPoint[]
  start: string
  end: string
}

export interface EventReplayPoint {
  date: string
  regime_actual: string
  regime_predicted: string
  transition_risk: number | null
  transition_actual: number
}

export interface EventReplayResponse {
  event_name: string
  warning_lead_days: number | null
  data: EventReplayPoint[]
}

export interface ThresholdSweepRow {
  threshold: number
  recall: number
  false_alert_rate: number
  alert_frequency: number
  avg_lead_time_days: number
}

export interface ModelDriversResponse {
  global_importance: DriverItem[]
  local_explanation: Record<string, number>
  threshold_sweep: ThresholdSweepRow[]
}

export interface DriverDelta {
  feature: string
  plain_label: string
  delta_value: number
}

export interface ScenarioRequest {
  vix_level: number
  vix_chg_5d: number
  rv_20d_pct: number
  drawdown_pct_504d: number
  ret_20d: number
  dist_sma50: number
  days_in_regime_lag1?: number
  turbulent_count_30d_lag1?: number
}

export interface ScenarioResponse {
  baseline_risk: number
  scenario_risk: number
  delta: number
  prob_calm: number
  prob_elevated: number
  prob_turbulent: number
  baseline_prob_calm: number
  baseline_prob_elevated: number
  baseline_prob_turbulent: number
  driver_deltas: DriverDelta[]
  baseline_inputs: Record<string, number>
}
