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
  const regimeLower = regime.toLowerCase()
  const isStressed = regimeLower === 'elevated' || regimeLower === 'turbulent'

  const regimeSentence =
    regimeLower === 'calm' ? 'SPY is in a calm regime.' :
    regimeLower === 'elevated' ? 'The market is in an elevated stress state.' :
    regimeLower === 'turbulent' ? 'Market conditions are currently turbulent.' :
    `SPY is in a ${regimeLower} regime.`

  const riskSentence =
    risk < 0.05
      ? isStressed
        ? 'The model sees very low risk of further deterioration this week.'
        : 'The model sees very low risk of conditions worsening this week.'
      : risk < 0.20
      ? isStressed
        ? 'Near-term risk of further worsening is low.'
        : 'The model sees low risk of conditions changing soon.'
      : risk < 0.40
      ? 'The model sees moderate risk of conditions worsening over the next week.'
      : isStressed
        ? 'The model sees elevated risk of further deterioration — conditions may continue to worsen.'
        : 'The model sees elevated risk of conditions worsening soon.'

  const trendSentence =
    trend === 'uptrend' ? 'The trend is positive.' :
    trend === 'downtrend' ? 'The trend is negative.' :
    'The trend is neutral.'

  const vixDir =
    (vixChg1d ?? 0) > 0.5 ? 'rising' :
    (vixChg1d ?? 0) < -0.5 ? 'falling' : 'stable'

  const vixPart = vixLevel != null ? ` VIX is at ${vixLevel.toFixed(1)} and ${vixDir}.` : ''

  return `${regimeSentence} ${riskSentence} ${trendSentence}${vixPart}`
}
