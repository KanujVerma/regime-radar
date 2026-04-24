export const FEATURE_LABELS: Record<string, string> = {
  vix_pct_504d:             'VIX relative to 2-year history',
  vix_level:                'Current VIX level',
  vix_zscore_252d:          'VIX z-score (1-year)',
  vix_chg_5d:               'VIX 5-day change',
  rv_20d_pct:               'Realized volatility percentile',
  drawdown_pct_504d:        'Drawdown relative to 2-year history',
  ret_20d:                  '20-day SPY return',
  momentum_20d:             '20-day momentum',
  dist_sma50:               'Distance from 50-day moving average',
  emv_level:                'Equity market volatility index',
  days_in_regime_lag1:      'Days in current regime (lagged)',
  turbulent_count_30d_lag1: 'Turbulent days in past 30 days (lagged)',
  trend_code:               'Trend direction',
}

export function labelFor(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature
}
