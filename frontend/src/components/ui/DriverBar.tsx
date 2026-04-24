import { labelFor } from '../../lib/featureLabels'

interface DriverBarProps {
  feature: string
  importance: number
  maxImportance: number
  positive?: boolean
}

export default function DriverBar({ feature, importance, maxImportance, positive = true }: DriverBarProps) {
  const pct = maxImportance > 0 ? (importance / maxImportance) * 100 : 0
  const color = positive ? '#06b6d4' : '#f87171'
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="text-[10px] text-right shrink-0" style={{ width: 180, color: '#94a3b8' }}>
        {labelFor(feature)}
      </div>
      <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ background: '#151d2e' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, opacity: 0.8 }}
        />
      </div>
      <div className="text-[10px] font-bold shrink-0 w-10 text-right" style={{ color }}>
        {(importance * 100).toFixed(1)}%
      </div>
    </div>
  )
}
