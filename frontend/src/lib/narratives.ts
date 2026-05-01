import { narrativeFragmentFor } from './featureLabels'

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

export const DRIVER_HEADLINES: Record<string, string> = {
  calm:      'Conditions improved, but the model is still cautious',
  elevated:  'Elevated conditions — the model is watching several factors',
  turbulent: 'Turbulent conditions — the model is registering significant stress signals',
}

export function getDriverHeadline(regime: string): string {
  return DRIVER_HEADLINES[regime.toLowerCase()] ?? `Current conditions: ${regime.toLowerCase()}`
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function buildDriversNarrative(
  regime: string,
  risk: number,
  topPushing: string[],
  topHolding: string[],
  priorRegime?: string | null,
): string {
  const regimeLower = regime.toLowerCase()
  const priorLower = priorRegime?.toLowerCase()

  // 1. Opening — only use transition phrasing when prior regime is explicitly different
  const opening =
    priorLower && priorLower !== regimeLower
      ? `After a period of ${priorLower} conditions, the market has shifted to ${regimeLower} today.`
      : `The market is currently in a ${regimeLower} state.`

  // 2. Pushing sentence — synthesize up to 2 fragments into natural copy
  let middle = ''
  const pushFragments = topPushing.slice(0, 2).map(f => narrativeFragmentFor(f, 'up'))
  if (risk > 0.40 && pushFragments.length > 0) {
    const pushStr = pushFragments.length === 2
      ? `${cap(pushFragments[0])} and ${pushFragments[1]}`
      : cap(pushFragments[0])
    const verb = pushFragments.length === 2 ? 'are' : 'is'
    middle = ` ${pushStr} ${verb} keeping the model cautious.`
  } else if (risk < 0.20 && regimeLower === 'calm') {
    middle = ' The model sees few notable stress signals at this time.'
  }

  // 3. Holding offset — synthesize up to 2 fragments
  let offset = ''
  const holdFragments = topHolding.slice(0, 2).map(f => narrativeFragmentFor(f, 'down'))
  if (risk >= 0.20 && holdFragments.length > 0) {
    const holdStr = holdFragments.length === 2
      ? `${holdFragments[0]} and ${holdFragments[1]}`
      : holdFragments[0]
    const verb = holdFragments.length === 2 ? 'are' : 'is'
    offset = ` At the same time, ${holdStr} ${verb} providing some offset.`
  }

  return `${opening}${middle}${offset}`.trim()
}
