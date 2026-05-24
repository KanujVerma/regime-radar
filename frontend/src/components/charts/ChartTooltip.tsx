import { colors } from '../../lib/tokens'

interface SeriesEntry {
  value?: number | string | null
  name?: string
  color?: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: SeriesEntry[]
  label?: string
  accentColor?: string
  formatter?: (value: number, name?: string) => string
  labelFormatter?: (label: string) => string
}

export default function ChartTooltip({
  active,
  payload,
  label,
  accentColor = colors.cyan,
  formatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const entries = payload.filter(e => e.value != null && typeof e.value === 'number')
  if (!entries.length) return null

  const displayLabel = labelFormatter ? labelFormatter(label ?? '') : (label ?? '')

  return (
    <div style={{
      background: colors.glass,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: `1px solid ${colors.cyanDim}`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 8,
      padding: '10px 14px',
      pointerEvents: 'none',
      minWidth: 120,
    }}>
      {displayLabel && (
        <div style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 6 }}>{displayLabel}</div>
      )}
      {entries.map((e, i) => {
        const val = e.value as number
        const display = formatter ? formatter(val, e.name) : val.toFixed(2)
        const dot = e.color ?? accentColor
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: i > 0 ? 4 : 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
            {e.name && <span style={{ fontSize: 11, color: colors.textMuted }}>{e.name}</span>}
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, marginLeft: 'auto' }}>{display}</span>
          </div>
        )
      })}
    </div>
  )
}
