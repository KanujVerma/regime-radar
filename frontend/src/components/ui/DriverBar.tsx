import { colors } from '../../lib/tokens'

interface DriverBarProps {
  label: string
  value: number
  max: number
  direction?: 'raising' | 'calming' | 'neutral'
  delay?: number
  focused?: boolean
  dimmed?: boolean
}

export default function DriverBar({ label, value, max, direction = 'neutral', delay = 0, focused: _focused = false, dimmed = false }: DriverBarProps) {
  const pct = Math.min((value / (max || 1)) * 100, 100)
  const barColor = direction === 'raising'
    ? 'linear-gradient(90deg, #f87171, #fbbf24)'
    : direction === 'calming'
      ? 'linear-gradient(90deg, #4ade80, #06b6d4)'
      : 'linear-gradient(90deg, #06b6d4, #0e4d6e)'
  const scoreColor = direction === 'raising' ? colors.red : direction === 'calming' ? colors.green : colors.cyan

  return (
    <div style={{ marginBottom: 10, opacity: dimmed ? 0.35 : 1, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: colors.textSecondary }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor }}>
          {direction === 'raising' ? '+' : direction === 'calming' ? '−' : ''}{value.toFixed(3)}
        </span>
      </div>
      <div style={{ height: 4, background: '#1a2540', borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: barColor,
            borderRadius: 2,
            animation: `barFill 350ms ease-out ${delay}ms both`,
          }}
        />
      </div>
    </div>
  )
}
