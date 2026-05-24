import { colors } from '../../lib/tokens'

interface MetricCardProps {
  label: string
  value: string
  valueColor?: string
  subtitle?: string
}

export default function MetricCard({ label, value, valueColor = colors.textPrimary, subtitle }: MetricCardProps) {
  return (
    <div
      className="card-hover rounded-lg px-4 py-3"
      style={{
        background: colors.surfaceElevated,
        border: `1px solid ${colors.borderElevated}`,
        boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.1em', color: colors.textDim, marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: valueColor, lineHeight: 1 }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 3 }}>
          {subtitle}
        </div>
      )}
    </div>
  )
}
