import { colors } from '../../lib/tokens'

export function formatSliderValue(value: number, decimals: number): string {
  return value.toFixed(decimals)
}

const SENSITIVITY_COLOR = {
  low: colors.green,
  medium: colors.amber,
  high: colors.red,
}

interface ScenarioSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  sensitivityLevel?: 'low' | 'medium' | 'high'
  decimals?: number
  onChange: (value: number) => void
}

export default function ScenarioSlider({
  label, value, min, max, step,
  sensitivityLevel = 'low',
  decimals = 1,
  onChange,
}: ScenarioSliderProps) {
  const dotColor = SENSITIVITY_COLOR[sensitivityLevel]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: colors.textSecondary }}>{label}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: colors.textPrimary, minWidth: 36, textAlign: 'right' }}>
          {formatSliderValue(value, decimals)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: colors.cyan, height: 4, cursor: 'pointer' }}
      />
    </div>
  )
}
