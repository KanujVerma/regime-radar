import { labelFor } from '../../lib/featureLabels'
import { colors } from '../../lib/tokens'

interface DriverBarProps {
  feature: string
  importance: number
  maxImportance: number
  positive?: boolean
  labelWidth?: number
  delay?: number
}

export default function DriverBar({ feature, importance, maxImportance, positive = true, labelWidth = 180, delay = 0 }: DriverBarProps) {
  const pct = maxImportance > 0 ? (importance / maxImportance) * 100 : 0
  const color = positive ? '#06b6d4' : '#f87171'
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: colors.textSecondary, width: labelWidth, textAlign: 'right' }}>
          {labelFor(feature)}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{(importance * 100).toFixed(1)}%</span>
      </div>
      <div style={{ height: 4, background: '#1a2540', borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: 2,
            animation: `barFill 350ms ease-out ${delay}ms both`,
          }}
        />
      </div>
    </div>
  )
}
