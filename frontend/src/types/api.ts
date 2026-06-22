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
  condition_values: Record<string, number>
  risk_reading?: RiskReading | null
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

export interface ReliabilityBin {
  p_low: number
  p_high: number
  p_mid: number
  empirical_rate: number
  n: number
}

export interface ReliabilityResponse {
  bins: ReliabilityBin[]
  base_rate: number
  max_evaluated_p: number
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
  risk_reading?: RiskReading | null
}

export interface DailyDriverEntry {
  feature: string
  plain_label: string
  importance: number
}

export interface DailyModelVersion {
  transition_model: string
  transition_trained_as_of: string
  regime_model: string
  regime_trained_as_of: string
}

export interface DailyStateSnapshot {
  as_of_date: string
  generated_at: string
  data_through_date: string
  regime: string
  transition_risk: number
  prob_calm: number | null
  prob_elevated: number | null
  prob_turbulent: number | null
  vix_level: number | null
  trend: string
  top_drivers: DailyDriverEntry[]
  model_version: DailyModelVersion
}

export interface DailyTopDriverRef {
  feature: string
  plain_label: string
}

export interface DailyDiff {
  regime_changed: boolean
  prior_regime: string | null
  risk_delta: number
  vix_delta: number | null
  trend_changed: boolean
  prior_trend: string | null
  top_driver_changed: boolean
  prior_top_driver: DailyTopDriverRef | null
  current_top_driver: DailyTopDriverRef | null
}

export interface DailyDiffMetadata {
  current_date: string
  previous_date: string
  gap_days: number
  is_stale: boolean
}

export interface DailyDiffResponse {
  current: DailyStateSnapshot
  previous: DailyStateSnapshot
  diff: DailyDiff
  metadata: DailyDiffMetadata
}

export interface ChangelogEntry {
  current_date: string
  previous_date: string | null
  gap_days: number
  is_stale_gap: boolean
  regime: string
  transition_risk: number
  risk_delta: number
  vix_level: number | null
  vix_delta: number | null
  trend: string
  prior_regime: string | null
  prior_trend: string | null
  top_driver: DailyDriverEntry | null
  prior_top_driver: DailyDriverEntry | null
  triggers: string[]
  primary_trigger: string | null
  narrative: string
}

export interface ChangelogResponse {
  entries: ChangelogEntry[]
  total_notable: number
  total_days: number
  earliest_date: string | null
  latest_date: string | null
}

export interface AnalogEntry {
  display_date: string
  full_date: string
  regime: string
  transition_risk: number
  spy_fwd_5d: number
  spy_fwd_20d: number
  regime_outcome_20d: string
}

export interface AnalogsResponse {
  query_date: string
  query_regime: string
  query_transition_risk: number
  analogs: AnalogEntry[]
  feature_set_version: string
}

export type RiskDisplayState = 'validated' | 'stress_in_support' | 'stress_out_of_support'
export type StressTier = 'Elevated' | 'High' | 'Extreme'
export type AnalogStatus = 'not_applicable' | 'available' | 'unavailable'

export interface RiskReadingAnalog {
  label: string
  date: string
  raw_score: number
}

export interface RiskReading {
  display_state: RiskDisplayState
  validated_probability: number | null
  stress_percentile: number | null
  stress_tier: StressTier | null
  analog_status: AnalogStatus
  nearest_analogs: RiskReadingAnalog[] | null
  support: { in_support: boolean; nn_z_distance: number }
  max_evaluated_p: number
}
