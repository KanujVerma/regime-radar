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

// Mid-sentence noun phrases — used inside hero narrative copy
const NARRATIVE_FRAGMENTS: Record<string, { up: string; down: string }> = {
  vix_pct_504d:             { up: 'an elevated volatility index relative to recent history', down: 'a subdued volatility index' },
  vix_level:                { up: 'an elevated VIX',                                        down: 'a low VIX' },
  vix_zscore_252d:          { up: 'VIX above its recent average',                           down: 'VIX below its recent average' },
  vix_chg_5d:               { up: 'a rising volatility index',                              down: 'a falling volatility index' },
  rv_20d:                   { up: 'elevated realized volatility',                           down: 'low realized volatility' },
  rv_20d_pct:               { up: 'above-average realized volatility',                      down: 'below-average realized volatility' },
  drawdown_pct_504d:        { up: 'a pullback from the 2-year high',                        down: 'proximity to the 2-year high' },
  ret_20d:                  { up: 'a weak 20-day return',                                   down: 'positive 20-day momentum' },
  momentum_20d:             { up: 'negative recent momentum',                               down: 'positive recent momentum' },
  dist_sma50:               { up: 'a drop below the 50-day average',                        down: 'support above the 50-day average' },
  emv_level:                { up: 'a rising equity market volatility index',                down: 'a low equity market volatility index' },
  days_in_regime_lag1:      { up: 'an extended run in the current conditions',              down: 'a recent regime change' },
  turbulent_count_30d_lag1: { up: 'a pickup in recent stress days',                        down: 'limited stress days recently' },
  trend_code:               { up: 'a negative price trend',                                 down: 'a positive price trend' },
}

export function narrativeFragmentFor(feature: string, direction: 'up' | 'down'): string {
  return NARRATIVE_FRAGMENTS[feature]?.[direction] ?? labelFor(feature).toLowerCase()
}

// Complete sentences for push/pull bullet lists
const SENTENCE_TEMPLATES: Record<string, { up: string; down: string }> = {
  vix_pct_504d:             { up: 'VIX is elevated relative to its recent history',          down: 'VIX is low relative to its recent history' },
  vix_level:                { up: 'The VIX level is elevated',                               down: 'The VIX level is low' },
  vix_zscore_252d:          { up: 'VIX is above its 1-year average',                         down: 'VIX is below its 1-year average' },
  vix_chg_5d:               { up: 'VIX has risen over the past week',                        down: 'VIX has been stable or falling' },
  rv_20d:                   { up: 'Recent realized volatility has been high',                 down: 'Recent realized volatility has been low' },
  rv_20d_pct:               { up: 'Realized volatility is above its historical average',     down: 'Realized volatility is below its historical average' },
  drawdown_pct_504d:        { up: 'SPY has pulled back from its 2-year high',                down: 'SPY is near its 2-year high' },
  ret_20d:                  { up: "SPY's 20-day return has been weak",                       down: 'SPY is up over the past 20 trading days' },
  momentum_20d:             { up: 'Recent price momentum has been negative',                 down: 'Recent price momentum has been positive' },
  dist_sma50:               { up: 'SPY has fallen below its 50-day average',                 down: 'SPY is holding above its 50-day average' },
  emv_level:                { up: 'The equity market volatility index is elevated',           down: 'The equity market volatility index is low' },
  days_in_regime_lag1:      { up: 'These conditions have lasted longer than usual',          down: 'These conditions are relatively recent' },
  turbulent_count_30d_lag1: { up: 'There have been more high-stress days recently',          down: 'High-stress days have been limited recently' },
  trend_code:               { up: "SPY's recent trend has turned negative",                  down: "SPY's recent trend remains positive" },
}

export function sentenceFor(feature: string, direction: 'up' | 'down'): string {
  return SENTENCE_TEMPLATES[feature]?.[direction] ?? labelFor(feature)
}
