export function formatRisk(r: number): string {
  if (r === 0) return '0%'
  const pct = r * 100
  if (pct < 0.1) return '<0.1%'
  return `${pct.toFixed(1)}%`
}

export function buildCurrentStateNarrative(
  regime: string,
  risk: number,
  trend: string,
  vixLevel: number | null,
  vixChg1d: number | null,
): string {
  const riskLevel =
    risk < 0.05 ? 'very low' :
    risk < 0.20 ? 'low' :
    risk < 0.40 ? 'moderate' : 'elevated'

  const trendSentence =
    trend === 'uptrend' ? 'The trend is positive.' :
    trend === 'downtrend' ? 'The trend is negative.' :
    'The trend is neutral.'

  const vixDir =
    (vixChg1d ?? 0) > 0.5 ? 'rising' :
    (vixChg1d ?? 0) < -0.5 ? 'falling' : 'stable'

  const vixPart = vixLevel != null
    ? ` VIX is at ${vixLevel.toFixed(1)} and ${vixDir}.`
    : ''

  return `SPY is in a ${regime} regime with ${riskLevel} transition risk (${formatRisk(risk)}). ${trendSentence}${vixPart}`
}
