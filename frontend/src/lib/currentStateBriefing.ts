import type { CurrentStateResponse, DailyDiffResponse, HistoricalPoint } from '../types/api'
import { SLIDER_CONFIG } from './sliderConfig'
import type { SliderConfig } from './sliderConfig'

export type Direction = 'up' | 'down' | 'flat'
export type StressStatus = 'calm' | 'watch' | 'stress'

export interface RiskTemperature {
  currentRisk: number
  percentile: number | null
  label: 'No history' | 'Normal' | 'Above normal' | 'Stretched' | 'Extreme'
}

export interface ChangeRow {
  feature: 'transition_risk' | 'regime' | 'vix_level' | 'trend'
  label: string
  value: number | string
  summary: string
  direction: Direction
}

export interface StressLadderRow {
  feature: SliderConfig['key']
  label: string
  value: number
  delta: number | null
  status: StressStatus
  calmMax: number
  stressMin: number
  watchHigher: string
  watchLower: string
}

export interface MarketContextCard {
  title: string
  body: string
}

export interface RegimePersistence {
  daysInRegime: number
  label: 'Short' | 'Typical' | 'Stretched'
}

export function percentileRank(
  currentRisk: number,
  historical: HistoricalPoint[],
): number | null {
  const values = historical
    .map((point) => point.transition_risk)
    .filter((value): value is number => value !== null && Number.isFinite(value))

  if (values.length === 0) return null

  const atOrBelow = values.filter((value) => value <= currentRisk).length
  return Math.round((atOrBelow / values.length) * 100)
}

export function buildRiskTemperature(
  currentRisk: number,
  historical: HistoricalPoint[],
): RiskTemperature {
  const percentile = percentileRank(currentRisk, historical)

  if (percentile === null) {
    return { currentRisk, percentile, label: 'No history' }
  }

  if (percentile >= 95) return { currentRisk, percentile, label: 'Extreme' }
  if (percentile >= 85) return { currentRisk, percentile, label: 'Stretched' }
  if (percentile >= 65) return { currentRisk, percentile, label: 'Above normal' }
  return { currentRisk, percentile, label: 'Normal' }
}

export function buildWhatChangedRows(
  current: CurrentStateResponse,
  dailyDiff: DailyDiffResponse | null,
): ChangeRow[] {
  const riskDelta = dailyDiff?.diff.risk_delta ?? current.delta?.risk_delta ?? 0
  const vixDelta = dailyDiff?.diff.vix_delta ?? null
  const priorRegime = dailyDiff?.diff.prior_regime ?? current.delta?.prior_regime
  const regimeChanged = dailyDiff?.diff.regime_changed ?? current.delta?.regime_changed ?? false
  const priorTrend = dailyDiff?.diff.prior_trend ?? null
  const trendChanged = dailyDiff?.diff.trend_changed ?? false

  return [
    {
      feature: 'transition_risk',
      label: 'Transition Risk',
      value: current.transition_risk,
      summary: `Latest daily change ${formatSignedPercent(riskDelta)}`,
      direction: directionFromDelta(riskDelta),
    },
    {
      feature: 'regime',
      label: 'Regime',
      value: current.regime,
      summary: regimeChanged && priorRegime
        ? `${titleCase(priorRegime)} to ${titleCase(current.regime)}`
        : 'No regime change',
      direction: regimeChanged ? 'up' : 'flat',
    },
    {
      feature: 'vix_level',
      label: 'VIX Level',
      value: current.vix_level ?? 'Unavailable',
      summary: vixDelta === null ? 'Latest VIX change unavailable' : `Latest VIX change ${formatSignedNumber(vixDelta)}`,
      direction: vixDelta === null ? 'flat' : directionFromDelta(vixDelta),
    },
    {
      feature: 'trend',
      label: 'Trend',
      value: current.trend,
      summary: trendChanged && priorTrend
        ? `${titleCase(priorTrend)} to ${titleCase(current.trend)}`
        : 'No trend change',
      direction: trendChanged ? directionFromTrend(current.trend) : 'flat',
    },
  ]
}

export function buildStressLadderRows(
  conditionValues: Record<string, number>,
  dailyDiff: DailyDiffResponse | null,
): StressLadderRow[] {
  return SLIDER_CONFIG
    .filter((config) => Number.isFinite(conditionValues[config.key]))
    .map((config) => {
      const value = conditionValues[config.key]
      const inverted = config.stressMin < config.calmMax

      return {
        feature: config.key,
        label: config.label,
        value,
        delta: config.key === 'vix_level' ? dailyDiff?.diff.vix_delta ?? null : null,
        status: stressStatus(value, config),
        calmMax: config.calmMax,
        stressMin: config.stressMin,
        watchHigher: inverted
          ? `${config.label} moving higher would likely ease pressure.`
          : `${config.label} moving higher would likely add pressure.`,
        watchLower: inverted
          ? `${config.label} moving lower would likely add pressure.`
          : `${config.label} moving lower would likely ease pressure.`,
      }
    })
}

export function buildMarketContextCards(cards: MarketContextCard[]): MarketContextCard[] {
  return cards.slice(0, 3)
}

export function classifyRegimePersistence(
  currentRegime: string,
  historical: HistoricalPoint[],
): RegimePersistence | null {
  if (historical.length === 0) return null

  let daysInRegime = 0
  for (let index = historical.length - 1; index >= 0; index -= 1) {
    if (historical[index].regime !== currentRegime) break
    daysInRegime += 1
  }

  if (daysInRegime === 0) return null

  const completedRuns = completedRunLengths(
    historical.slice(0, historical.length - daysInRegime),
    currentRegime,
  )
  const median = medianValue(completedRuns)

  if (median === null) return { daysInRegime, label: 'Typical' }
  if (daysInRegime < Math.max(2, median * 0.5)) return { daysInRegime, label: 'Short' }
  if (daysInRegime > Math.max(5, median * 1.75)) return { daysInRegime, label: 'Stretched' }
  return { daysInRegime, label: 'Typical' }
}

function stressStatus(value: number, config: SliderConfig): StressStatus {
  if (config.stressMin < config.calmMax) {
    if (value <= config.stressMin) return 'stress'
    if (value >= config.calmMax) return 'calm'
    return 'watch'
  }

  if (value >= config.stressMin) return 'stress'
  if (value <= config.calmMax) return 'calm'
  return 'watch'
}

function completedRunLengths(history: HistoricalPoint[], regime: string): number[] {
  const runs: number[] = []
  let currentRun = 0

  for (const point of history) {
    if (point.regime === regime) {
      currentRun += 1
    } else if (currentRun > 0) {
      runs.push(currentRun)
      currentRun = 0
    }
  }

  if (currentRun > 0) runs.push(currentRun)
  return runs
}

function medianValue(values: number[]): number | null {
  if (values.length === 0) return null

  const sorted = [...values].sort((a, b) => a - b)
  const midpoint = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 1) return sorted[midpoint]
  return (sorted[midpoint - 1] + sorted[midpoint]) / 2
}

function directionFromDelta(delta: number): Direction {
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'flat'
}

function directionFromTrend(trend: string): Direction {
  return trend.toLowerCase().includes('down') ? 'up' : 'down'
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function formatSignedPercent(value: number): string {
  const percentage = value * 100
  return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)} pts`
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
}
