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

  return `SPY is in a ${regime} regime with ${riskLevel} transition risk (${(risk * 100).toFixed(0)}%). ${trendSentence}${vixPart}`
}
