import type { RiskReading } from '../types/api'

export interface RiskReadingView {
  kind: 'validated' | 'stress_in_support' | 'stress_out_of_support'
  showsPercent: boolean
  value: string | null     // the calibrated percent string, validated only
  tier: string | null
  lines: string[]          // human copy; NEVER contains a probability percent in stress states
}

/** Pure mapping from the backend contract to display fields. Owns the invariant
 *  that no probability-looking percent appears above the validated range. */
export function riskReadingView(r: RiskReading): RiskReadingView {
  if (r.display_state === 'validated') {
    const pct = Math.round((r.validated_probability ?? 0) * 100)
    return { kind: 'validated', showsPercent: true, value: `${pct}%`, tier: null, lines: [] }
  }

  const pctMoreExtreme = r.stress_percentile != null ? Math.round(r.stress_percentile * 100) : null
  const severityNote = pctMoreExtreme != null
    ? [`Louder than ${pctMoreExtreme} of 100 historical model readings — ranks severity, not odds.`]
    : []

  if (r.display_state === 'stress_in_support') {
    const analogLine = (r.analog_status === 'available' && r.nearest_analogs && r.nearest_analogs.length)
      ? [`Model alarm at a level last seen in ${r.nearest_analogs.map(a => a.label).join(', ')}.`]
      : []
    return {
      kind: 'stress_in_support', showsPercent: false, value: null,
      tier: r.stress_tier, lines: [...analogLine, ...severityNote],
    }
  }

  // stress_out_of_support — severity present, trust downgraded (not "max severity")
  const z = r.support.nn_z_distance
  return {
    kind: 'stress_out_of_support', showsPercent: false, value: null, tier: r.stress_tier,
    lines: [
      `No historical analog — inputs ${z.toFixed(1)}σ beyond anything observed.`,
      'Severity signal present, but outside validated support; treat as untrusted.',
    ],
  }
}
