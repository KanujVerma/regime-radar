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
  const article = /^[aeiou]/i.test(regimeLower) ? 'an' : 'a'
  const opening =
    priorLower && priorLower !== regimeLower
      ? `After a period of ${priorLower} conditions, the market has shifted to ${regimeLower} today.`
      : `The market is currently in ${article} ${regimeLower} state.`

  // 2. Pushing sentence — synthesize up to 2 fragments into natural copy
  let middle = ''
  const pushFragments = topPushing.slice(0, 2).map(f => narrativeFragmentFor(f, 'up'))
  if (risk >= 0.40 && pushFragments.length > 0) {
    const pushStr = pushFragments.length === 2
      ? `${cap(pushFragments[0])} and ${pushFragments[1]}`
      : cap(pushFragments[0])
    const verb = pushFragments.length === 2 ? 'are' : 'is'
    middle = ` ${pushStr} ${verb} keeping the model cautious.`
  } else if (risk < 0.20 && regimeLower === 'calm') {
    middle = ' The model sees few notable stress signals at this time.'
  } else if (middle === '' && regimeLower !== 'calm') {
    middle = ' The model is monitoring conditions for signs of change.'
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

import type { ScenarioInputs } from './sliderConfig'

export type ScenarioCharacter = 'sharp-shock' | 'slow-grind' | 'neutral'

export interface ScenarioVerdictResult {
  badgeLabel: string
  badgeColor: string
  badgeBg: string
  badgeBorder: string
  sentence: string
}

type SeverityTier = 'calm' | 'stress-building' | 'elevated' | 'strongly-elevated' | 'turbulent-emerging'

function getSeverityTier(probCalm: number, probTurbulent: number): SeverityTier {
  if (probCalm >= 0.70)                          return 'calm'
  if (probCalm >= 0.40)                          return 'stress-building'
  if (probCalm >= 0.15 && probTurbulent < 0.02)  return 'elevated'
  if (probCalm < 0.15  && probTurbulent < 0.02)  return 'strongly-elevated'
  return 'turbulent-emerging'
}

const BADGE_STYLES: Record<SeverityTier, Pick<ScenarioVerdictResult, 'badgeLabel' | 'badgeColor' | 'badgeBg' | 'badgeBorder'>> = {
  'calm':               { badgeLabel: 'Calm',                 badgeColor: '#4ade80', badgeBg: '#0f2a1a', badgeBorder: '#14532d' },
  'stress-building':    { badgeLabel: 'Mild stress',          badgeColor: '#06b6d4', badgeBg: '#051820', badgeBorder: '#0e3d55' },
  'elevated':           { badgeLabel: 'Elevated stress',      badgeColor: '#fbbf24', badgeBg: '#1a1505', badgeBorder: '#78350f' },
  'strongly-elevated':  { badgeLabel: 'High stress',          badgeColor: '#f97316', badgeBg: '#1a0c03', badgeBorder: '#7c2d12' },
  'turbulent-emerging': { badgeLabel: 'Elevated + turbulent', badgeColor: '#f87171', badgeBg: '#1a0505', badgeBorder: '#7f1d1d' },
}

function getSentence(tier: SeverityTier, topDriverLabel: string, character: ScenarioCharacter): string {
  switch (tier) {
    case 'calm':
      return 'Conditions remain calm under this scenario. The model sees no meaningful stress signal.'
    case 'stress-building':
      return `Calm is still the most likely outcome, but stress conditions are starting to build. ${topDriverLabel} is the main factor weighing on the model.`
    case 'elevated':
      if (character === 'sharp-shock')
        return 'This looks like a sharp stress event — elevated conditions are dominant. Calm has receded but turbulent probability remains contained.'
      if (character === 'slow-grind')
        return `This scenario is mostly Elevated rather than Turbulent — more of a slow deterioration than a sudden shock. ${topDriverLabel} is the primary driver.`
      return 'This scenario is mostly Elevated rather than Turbulent. Calm has receded and elevated conditions are dominant.'
    case 'strongly-elevated':
      return `Calm has largely left the picture under this scenario. Elevated conditions are heavily dominant — ${topDriverLabel} is driving the stress reading.`
    case 'turbulent-emerging':
      return `Turbulent risk is beginning to emerge alongside elevated stress. ${topDriverLabel} is pushing conditions toward a more severe stress classification.`
  }
}

export function detectScenarioCharacter(inputs: ScenarioInputs): ScenarioCharacter {
  if (inputs.vix_chg_5d >= 5 && inputs.ret_20d <= -0.07) return 'sharp-shock'
  if (inputs.vix_chg_5d <= 2 && inputs.drawdown_pct_504d >= 0.25) return 'slow-grind'
  return 'neutral'
}

export function buildScenarioVerdict(
  probCalm: number,
  probElevated: number,
  probTurbulent: number,
  topDriverLabel: string,
  character: ScenarioCharacter = 'neutral',
): ScenarioVerdictResult {
  if (!isFinite(probCalm) || !isFinite(probElevated) || !isFinite(probTurbulent)) {
    return {
      badgeLabel: 'Unavailable',
      badgeColor: '#475569',
      badgeBg: '#0c1020',
      badgeBorder: '#1e293b',
      sentence: 'Scenario data is not available yet.',
    }
  }
  const tier = getSeverityTier(probCalm, probTurbulent)
  return {
    ...BADGE_STYLES[tier],
    sentence: getSentence(tier, topDriverLabel, character),
  }
}
