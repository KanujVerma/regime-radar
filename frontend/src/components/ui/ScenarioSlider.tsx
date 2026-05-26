import { colors } from '../../lib/tokens'

export function formatSliderValue(value: number, decimals: number): string {
  return value.toFixed(decimals)
}

/** Snap a value to the nearest step increment — matches the range input's own rounding. */
export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step
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
  /** When provided, activates changed-from-preset styling if snapped value ≠ snapped presetValue. */
  presetValue?: number
  onChange: (value: number) => void
}

export default function ScenarioSlider({
  label, value, min, max, step,
  sensitivityLevel = 'low',
  decimals = 1,
  presetValue,
  onChange,
}: ScenarioSliderProps) {
  const dotColor = SENSITIVITY_COLOR[sensitivityLevel]

  const isChanged = presetValue !== undefined &&
    roundToStep(value, step) !== roundToStep(presetValue, step)

  const range = max - min
  const currentFrac = Math.max(0, Math.min(1, (value - min) / range))
  const presetFrac = presetValue !== undefined
    ? Math.max(0, Math.min(1, (presetValue - min) / range))
    : null

  const loFrac = presetFrac !== null ? Math.min(currentFrac, presetFrac) : 0
  const hiFrac = presetFrac !== null ? Math.max(currentFrac, presetFrac) : currentFrac

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '2px 0' }}>
      {/* Label + value row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: colors.textSecondary }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, minWidth: 36, textAlign: 'right',
            color: isChanged ? '#60a5fa' : colors.textPrimary,
          }}>
            {formatSliderValue(value, decimals)}
          </span>
          {isChanged && presetValue !== undefined && (
            <span style={{ fontSize: 9, color: '#2d4a6a', whiteSpace: 'nowrap' }}>
              (preset: {formatSliderValue(presetValue, decimals)})
            </span>
          )}
        </div>
      </div>

      {/* Track + thumb — outer div is taller for hit area, track is vertically centered */}
      <div style={{ position: 'relative', height: 16, display: 'flex', alignItems: 'center' }}>
        {/* Track background */}
        <div style={{ position: 'absolute', left: 0, right: 0, height: 3, background: '#1e2a3a', borderRadius: 2 }} />
        {/* Track fill */}
        {isChanged && presetFrac !== null ? (
          <>
            <div style={{
              position: 'absolute', left: 0, height: 3,
              width: `${loFrac * 100}%`,
              background: '#1e3a5c', borderRadius: 2,
            }} />
            <div style={{
              position: 'absolute', left: `${loFrac * 100}%`, height: 3,
              width: `${(hiFrac - loFrac) * 100}%`,
              background: '#3b82f6', borderRadius: 2,
            }} />
          </>
        ) : (
          <div style={{
            position: 'absolute', left: 0, height: 3,
            width: `${currentFrac * 100}%`,
            background: '#3b82f6', borderRadius: 2,
          }} />
        )}
        {/* Thumb — shows current position, makes it clear this is a slider */}
        <div style={{
          position: 'absolute',
          left: `${currentFrac * 100}%`,
          transform: 'translateX(-50%)',
          width: 10, height: 10,
          borderRadius: '50%',
          background: isChanged ? '#60a5fa' : '#3b82f6',
          border: '1.5px solid #060c1a',
          pointerEvents: 'none',
          flexShrink: 0,
        }} />
        {/* Invisible range input overlaid for interaction */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            opacity: 0, cursor: 'grab', margin: 0,
          }}
        />
      </div>
    </div>
  )
}
