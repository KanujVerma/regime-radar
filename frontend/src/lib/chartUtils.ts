import type { HistoricalPoint } from '../types/api'

export function buildRegimeBands(data: HistoricalPoint[]): { start: string; end: string; regime: string }[] {
  const bands: { start: string; end: string; regime: string }[] = []
  let current: { start: string; regime: string } | null = null
  for (const pt of data) {
    if (!current || current.regime !== pt.regime) {
      if (current) bands.push({ ...current, end: pt.date })
      current = { start: pt.date, regime: pt.regime }
    }
  }
  if (current && data.length > 0) {
    bands.push({ ...current, end: data[data.length - 1].date })
  }
  return bands
}
