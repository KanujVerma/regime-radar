interface MetricCardProps {
  label: string
  value: string
  subtitle?: string
  valueColor?: string
  delta?: { label: string; positive: boolean } | null
}

export default function MetricCard({ label, value, subtitle, valueColor = '#f1f5f9', delta }: MetricCardProps) {
  return (
    <div
      className="relative rounded-[10px] px-4 py-3.5"
      style={{ background: '#0c1020', border: '1px solid #151d2e' }}
    >
      {delta && (
        <span
          className="absolute top-2.5 right-3 text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{
            background: delta.positive ? '#052e1620' : '#450a0a20',
            color: delta.positive ? '#4ade80' : '#f87171',
          }}
        >
          {delta.label}
        </span>
      )}
      <div className="text-[9px] font-bold tracking-widest uppercase mb-1.5" style={{ color: '#2d4060' }}>
        {label}
      </div>
      <div className="text-[22px] font-extrabold tracking-tight leading-none" style={{ color: valueColor }}>
        {value}
      </div>
      {subtitle && <div className="text-[9px] mt-1" style={{ color: '#334155' }}>{subtitle}</div>}
    </div>
  )
}
