import { regimeColor } from '../../lib/tokens'

const REGIMES = [
  { key: 'calm', label: 'Calm' },
  { key: 'elevated', label: 'Elevated' },
  { key: 'turbulent', label: 'Turbulent' },
] as const

interface RegimeLegendProps {
  only?: ReadonlyArray<string>
}

export default function RegimeLegend({ only }: RegimeLegendProps = {}) {
  const visible = only ? REGIMES.filter(r => only.includes(r.key)) : REGIMES
  return (
    <div className="flex gap-3 items-center">
      {visible.map(({ key, label }) => (
        <span key={key} className="flex items-center gap-1.5">
          <span style={{ color: regimeColor[key], fontSize: 11 }}>●</span>
          <span style={{ color: '#94a3b8', fontSize: 10 }}>{label}</span>
        </span>
      ))}
    </div>
  )
}
