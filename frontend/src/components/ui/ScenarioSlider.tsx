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
      <div style={{ position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>
        {/* Track shell — recessed glass groove */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 5,
          background: 'rgba(10,15,28,0.7)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 4,
          boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.7), inset 0 0 1px rgba(0,0,0,0.5)',
        }} />
        {/* Track fill */}
        {isChanged && presetFrac !== null ? (
          <>
            <div style={{
              position: 'absolute', left: 0, height: 5,
              width: `${loFrac * 100}%`,
              background: 'linear-gradient(180deg, #1e4a70 0%, #1a3a5c 100%)',
              borderRadius: 4,
            }} />
            <div style={{
              position: 'absolute', left: `${loFrac * 100}%`, height: 5,
              width: `${(hiFrac - loFrac) * 100}%`,
              background: 'linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)',
              borderRadius: 4,
              boxShadow: '0 0 8px rgba(59,130,246,0.55)',
            }} />
          </>
        ) : (
          <div style={{
            position: 'absolute', left: 0, height: 5,
            width: `${currentFrac * 100}%`,
            background: 'linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)',
            borderRadius: 4,
            boxShadow: '0 0 8px rgba(59,130,246,0.4)',
          }} />
        )}
        {/* Thumb — glass-style with inner highlight and ambient glow */}
        <div style={{
          position: 'absolute',
          left: `${currentFrac * 100}%`,
          transform: 'translateX(-50%)',
          width: 12, height: 12,
          borderRadius: '50%',
          background: isChanged
            ? 'radial-gradient(circle at 35% 35%, #93c5fd, #3b82f6)'
            : 'radial-gradient(circle at 35% 35%, #60a5fa, #1d4ed8)',
          border: '1px solid rgba(147,197,253,0.25)',
          boxShadow: isChanged
            ? '0 0 6px 1px rgba(96,165,250,0.5), inset 0 1px 0 rgba(255,255,255,0.15)'
            : '0 0 6px 1px rgba(59,130,246,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
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
