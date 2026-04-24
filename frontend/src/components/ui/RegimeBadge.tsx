import { regimeColor } from '../../lib/tokens'

interface RegimeBadgeProps {
  regime: string
  probability?: number | null
}

export default function RegimeBadge({ regime, probability }: RegimeBadgeProps) {
  const color = regimeColor[regime.toLowerCase()] ?? regimeColor['unknown']
  return (
    <div
      className="flex-1 rounded-[7px] px-2.5 py-2 text-center"
      style={{ background: `${color}10`, border: `1px solid ${color}30` }}
    >
      <div className="text-[9px] font-bold tracking-wide capitalize" style={{ color }}>
        {regime}
      </div>
      {probability != null && (
        <div className="text-[15px] font-extrabold mt-0.5" style={{ color }}>
          {(probability * 100).toFixed(0)}%
        </div>
      )}
    </div>
  )
}
