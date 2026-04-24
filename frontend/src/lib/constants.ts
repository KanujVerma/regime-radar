export const DEFAULT_THRESHOLD = 0.10
export const ALERT_THRESHOLD = 0.30

export const RISK_ZONES = [
  { label: 'Low',         min: 0,    max: 0.15, color: '#166534' },
  { label: 'Moderate',    min: 0.15, max: 0.35, color: '#92400e' },
  { label: 'Elevated',    min: 0.35, max: 0.65, color: '#b45309' },
  { label: 'High Stress', min: 0.65, max: 1.0,  color: '#7f1d1d' },
] as const
