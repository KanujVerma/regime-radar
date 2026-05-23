import { regimeColor } from '../lib/tokens'
import type { AnalogEntry } from '../types/api'

function fmtReturn(v: number): string {
  const pct = (v * 100).toFixed(1)
  return v >= 0 ? `+${pct}%` : `${pct}%`
}

interface AnalogCardProps {
  analog: AnalogEntry
}

export default function AnalogCard({ analog }: AnalogCardProps) {
  const color = regimeColor[analog.regime.toLowerCase()] ?? regimeColor['unknown']
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-lg font-semibold text-white/60">{analog.display_date}</div>

      <div
        className="inline-block self-start rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide"
        style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
      >
        {analog.regime}
      </div>

      <div className="text-sm text-white/50">
        {(analog.transition_risk * 100).toFixed(0)}% risk
      </div>

      <div className="flex gap-4 text-sm">
        <span className="text-white/60">
          5d: <span className="text-white/90 font-medium">{fmtReturn(analog.spy_fwd_5d)}</span>
        </span>
        <span className="text-white/60">
          20d: <span className="text-white/90 font-medium">{fmtReturn(analog.spy_fwd_20d)}</span>
        </span>
      </div>

      <div className="text-xs text-white/40 leading-snug">{analog.regime_outcome_20d}</div>
    </div>
  )
}
