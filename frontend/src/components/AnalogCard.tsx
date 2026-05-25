import { colors, regimeColor } from '../lib/tokens'
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
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      background: colors.surfaceElevated,
      border: `1px solid ${color}26`,
      borderRadius: 10,
      boxShadow: '0 2px 16px rgba(0,0,0,0.35)',
      padding: '14px 16px',
    }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: colors.textSecondary }}>{analog.display_date}</div>

      <div style={{
        display: 'inline-block', alignSelf: 'flex-start',
        borderRadius: 4, padding: '2px 8px',
        fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
        background: `${color}20`, color, border: `1px solid ${color}40`,
      }}>
        {analog.regime}
      </div>

      <div style={{ fontSize: 14, color: colors.textMuted }}>
        {(analog.transition_risk * 100).toFixed(0)}% risk
      </div>

      <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
        <span style={{ color: colors.textSecondary }}>
          5d: <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{fmtReturn(analog.spy_fwd_5d)}</span>
        </span>
        <span style={{ color: colors.textSecondary }}>
          20d: <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{fmtReturn(analog.spy_fwd_20d)}</span>
        </span>
      </div>

      <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.4 }}>{analog.regime_outcome_20d}</div>
    </div>
  )
}
