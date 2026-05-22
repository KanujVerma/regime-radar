import type { ReliabilityBin, ReliabilityResponse } from '../types/api'

export interface ReliabilityContext {
  /** Whether the live reading is beyond the model's historically evaluated range */
  out_of_range: boolean
  /** The bin covering the live p, or null if not found */
  bin: ReliabilityBin | null
  /** The highest bin with enough samples — used as the reference when out_of_range */
  reference_bin: ReliabilityBin | null
  base_rate: number
  max_evaluated_p: number
}

const MIN_N = 30

/**
 * Look up the empirical reliability context for a live transition-risk reading p.
 *
 * - When p <= max_evaluated_p and the matching bin has n >= MIN_N, returns that
 *   bin's empirical_rate and n as the "track record."
 * - When p > max_evaluated_p OR the matching bin has n < MIN_N, marks
 *   out_of_range = true and returns the highest well-sampled bin as reference_bin,
 *   labelled as "closest historical readings."
 */
export function reliabilityFor(p: number, table: ReliabilityResponse): ReliabilityContext {
  const { bins, base_rate, max_evaluated_p } = table

  const bin = bins.find(b => p >= b.p_low && p < b.p_high) ?? null
  const reference_bin = [...bins]
    .reverse()
    .find(b => b.n >= MIN_N) ?? null

  const out_of_range =
    p > max_evaluated_p ||
    bin === null ||
    bin.n < MIN_N

  return { out_of_range, bin, reference_bin, base_rate, max_evaluated_p }
}

/** Format a reliability context into a short human-readable line. */
export function reliabilityLine(ctx: ReliabilityContext): string {
  if (ctx.out_of_range) {
    const maxPct = Math.round(ctx.max_evaluated_p * 100)
    return `Above the model's validated range (max ~${maxPct}%). No comparable historical analog in validation data. Treat as a directional stress signal, not a calibrated probability.`
  }

  if (!ctx.bin) return ''

  const rate = Math.round(ctx.bin.empirical_rate * 100)
  const lo = Math.round(ctx.bin.p_low * 100)
  const hi = Math.round(ctx.bin.p_high * 100)
  const n = ctx.bin.n
  const baseRate = Math.round(ctx.base_rate * 100)

  if (n < MIN_N) {
    return `Track record at ${lo}–${hi}%: worsened ${rate}% of the time (n=${n} — small sample).`
  }

  return `Track record at ${lo}–${hi}%: worsened ${rate}% of the time (n=${n}; base rate ${baseRate}%).`
}
