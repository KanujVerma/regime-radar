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

/** Build a risk-direction gradient using the calm/stress threshold fractions. */
function buildRiskGradient(calmFrac: number, stressFrac: number): string {
  const mid = ((calmFrac + stressFrac) / 2 * 100).toFixed(1)
  const c = (f: number) => `${(f * 100).toFixed(1)}%`
  if (stressFrac > calmFrac) {
    // Higher value = riskier (VIX, drawdown, etc.)
    return `linear-gradient(to right, #134e2a 0%, #134e2a ${c(calmFrac)}, #1e3a5c ${mid}%, #7c2d12 ${c(stressFrac)}, #881b1b 100%)`
  } else {
    // Lower value = riskier (return, dist_sma50)
    return `linear-gradient(to right, #881b1b 0%, #7c2d12 ${c(stressFrac)}, #1e3a5c ${mid}%, #134e2a ${c(calmFrac)}, #134e2a 100%)`
  }
}

const THUMB = {
  calm: {
    bg:     'radial-gradient(circle at 35% 35%, #6ee7b7, #059669)',
    shadow: '0 0 7px rgba(16,185,129,0.6), inset 0 1px 0 rgba(255,255,255,0.18)',
    border: 'rgba(110,231,183,0.35)',
  },
  elevated: {
    bg:     'radial-gradient(circle at 35% 35%, #93c5fd, #3b82f6)',
    shadow: '0 0 7px rgba(59,130,246,0.5), inset 0 1px 0 rgba(255,255,255,0.18)',
    border: 'rgba(147,197,253,0.3)',
  },
  stress: {
    bg:     'radial-gradient(circle at 35% 35%, #fca5a5, #dc2626)',
    shadow: '0 0 7px rgba(220,38,38,0.6), inset 0 1px 0 rgba(255,255,255,0.18)',
    border: 'rgba(252,165,165,0.35)',
  },
  changed: {
    bg:     'radial-gradient(circle at 35% 35%, #93c5fd, #3b82f6)',
    shadow: '0 0 7px rgba(96,165,250,0.6), inset 0 1px 0 rgba(255,255,255,0.18)',
    border: 'rgba(147,197,253,0.3)',
  },
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
  /** Threshold below which the regime is calm — used to build the risk gradient. */
  calmMax?: number
  /** Threshold above which the regime is stressed — used to build the risk gradient. */
  stressMin?: number
  onChange: (value: number) => void
}

export default function ScenarioSlider({
  label, value, min, max, step,
  sensitivityLevel = 'low',
  decimals = 1,
  presetValue,
  calmMax,
  stressMin,
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

  // Risk gradient — uses calmMax/stressMin from sliderConfig if available
  const hasBands = calmMax !== undefined && stressMin !== undefined
  const calmFrac  = hasBands ? Math.max(0, Math.min(1, (calmMax!  - min) / range)) : null
  const stressFrac = hasBands ? Math.max(0, Math.min(1, (stressMin! - min) / range)) : null
  const riskUp = calmFrac !== null && stressFrac !== null ? stressFrac > calmFrac : null

  // Which risk zone is the thumb currently in?
  const riskZone: 'calm' | 'elevated' | 'stress' = (() => {
    if (calmFrac === null || stressFrac === null || riskUp === null) return 'elevated'
    if (riskUp) {
      if (currentFrac <= calmFrac) return 'calm'
      if (currentFrac >= stressFrac) return 'stress'
      return 'elevated'
    } else {
      if (currentFrac >= calmFrac) return 'calm'
      if (currentFrac <= stressFrac) return 'stress'
      return 'elevated'
    }
  })()

  const thumb = isChanged ? THUMB.changed : THUMB[riskZone]

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

      {/* Track + thumb */}
      <div style={{ position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>

        {hasBands && calmFrac !== null && stressFrac !== null ? (
          <>
            {/* Risk-direction gradient track — calm ↔ stress based on feature direction */}
            <div style={{
              position: 'absolute', left: 0, right: 0, height: 5,
              background: buildRiskGradient(calmFrac, stressFrac),
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 4,
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6)',
            }} />
            {/* Dim overlay for the uncovered portion — shows what's still ahead */}
            <div style={{
              position: 'absolute',
              left: `${currentFrac * 100}%`, right: 0, height: 5,
              background: 'rgba(4, 7, 16, 0.72)',
              borderRadius: '0 4px 4px 0',
            }} />
          </>
        ) : isChanged && presetFrac !== null ? (
          <>
            {/* Plain dark groove */}
            <div style={{ position: 'absolute', left: 0, right: 0, height: 5, background: 'rgba(10,15,28,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.7)' }} />
            {/* Dim fill up to lower of current/preset */}
            <div style={{ position: 'absolute', left: 0, height: 5, width: `${loFrac * 100}%`, background: 'linear-gradient(180deg,#1e4a70,#1a3a5c)', borderRadius: 4 }} />
            {/* Bright delta fill */}
            <div style={{ position: 'absolute', left: `${loFrac * 100}%`, height: 5, width: `${(hiFrac - loFrac) * 100}%`, background: 'linear-gradient(180deg,#60a5fa,#3b82f6)', borderRadius: 4, boxShadow: '0 0 8px rgba(59,130,246,0.55)' }} />
          </>
        ) : (
          <>
            {/* Plain dark groove */}
            <div style={{ position: 'absolute', left: 0, right: 0, height: 5, background: 'rgba(10,15,28,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.7)' }} />
            {/* Blue fill */}
            <div style={{ position: 'absolute', left: 0, height: 5, width: `${currentFrac * 100}%`, background: 'linear-gradient(180deg,#60a5fa,#3b82f6)', borderRadius: 4, boxShadow: '0 0 8px rgba(59,130,246,0.4)' }} />
          </>
        )}

        {/* Thumb — color reflects risk zone; accent blue when diverged from preset */}
        <div style={{
          position: 'absolute',
          left: `${currentFrac * 100}%`,
          transform: 'translateX(-50%)',
          width: 12, height: 12,
          borderRadius: '50%',
          background: thumb.bg,
          border: `1px solid ${thumb.border}`,
          boxShadow: thumb.shadow,
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
