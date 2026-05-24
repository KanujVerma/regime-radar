import type { HistoricalPoint } from '../types/api'

export function buildRegimeBands<T>(
  data: T[],
  getRegime: (pt: T) => string,
  getDate: (pt: T) => string,
): { start: string; end: string; regime: string }[] {
  const bands: { start: string; end: string; regime: string }[] = []
  let current: { start: string; regime: string } | null = null
  for (const pt of data) {
    const regime = getRegime(pt)
    if (!current || current.regime !== regime) {
      if (current) bands.push({ ...current, end: getDate(pt) })
      current = { start: getDate(pt), regime }
    }
  }
  if (current && data.length > 0) {
    bands.push({ ...current, end: getDate(data[data.length - 1]) })
  }
  return bands
}

// Convenience wrapper for HistoricalPoint (existing callers)
export function buildHistoricalBands(data: HistoricalPoint[]) {
  return buildRegimeBands(data, p => p.regime, p => p.date)
}
