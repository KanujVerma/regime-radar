export const FEATURE_LABELS: Record<string, string> = {
  vix_pct_504d:             'VIX relative to 2-year history',
  vix_level:                'Current VIX level',
  vix_zscore_252d:          'VIX vs 1-year history',
  vix_chg_5d:               'VIX 5-day change',
  rv_20d:                   'Recent realized volatility',
  rv_20d_pct:               'Realized volatility vs history',
  drawdown_pct_504d:        'Drawdown relative to 2-year high',
  ret_20d:                  '20-day SPY return',
  momentum_20d:             '20-day price momentum',
  dist_sma50:               'Distance from 50-day moving average',
  emv_level:                'Equity market volatility index',
  days_in_regime_lag1:      'Days in current regime',
  turbulent_count_30d_lag1: 'Recent high-stress days',
  trend_code:               'Trend direction',
}

export function labelFor(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature
}
