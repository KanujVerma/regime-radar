interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ value?: number | string | null | undefined; name?: string }>
  label?: string
  accentColor?: string
  formatter?: (value: number) => string
  labelFormatter?: (label: string) => string
}

export default function ChartTooltip({
  active,
  payload,
  label,
  accentColor = '#06b6d4',
  formatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const raw = payload[0]?.value
  if (raw == null || typeof raw !== 'number') return null
  const displayValue = formatter ? formatter(raw) : String(raw)
  const displayLabel = labelFormatter ? labelFormatter(label ?? '') : (label ?? '')

  return (
    <div
      style={{
        background: 'rgba(8,11,24,0.97)',
        border: '1px solid #1e3a5f',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: 8,
        padding: '10px 14px',
        pointerEvents: 'none',
        minWidth: 120,
      }}
    >
      {displayLabel && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{displayLabel}</div>
      )}
      <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{displayValue}</div>
    </div>
  )
}
