import type { ReliabilityBin, ReliabilityResponse } from '../types/api'

export interface ReliabilityContext {
  bin: ReliabilityBin | null
  base_rate: number
  max_evaluated_p: number
}

/** Validated-zone track-record context for a calibrated p. Stress handling is
 *  owned by the backend display_state + riskReadingView, not recomputed here. */
export function reliabilityFor(p: number, table: ReliabilityResponse): ReliabilityContext {
  const { bins, base_rate, max_evaluated_p } = table
  const bin = bins.find(b => p >= b.p_low && p < b.p_high) ?? null
  return { bin, base_rate, max_evaluated_p }
}

/** Validated-zone track-record line. Callers invoke only when display_state === 'validated'. */
export function reliabilityLine(ctx: ReliabilityContext): string {
  if (!ctx.bin) return ''
  const rate = Math.round(ctx.bin.empirical_rate * 100)
  const lo = Math.round(ctx.bin.p_low * 100)
  const hi = Math.round(ctx.bin.p_high * 100)
  const n = ctx.bin.n
  const baseRate = Math.round(ctx.base_rate * 100)
  return `Track record at ${lo}-${hi}%: worsened ${rate}% of the time (n=${n}; base rate ${baseRate}%).`
}
