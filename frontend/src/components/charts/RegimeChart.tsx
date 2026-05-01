import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea, CartesianGrid,
} from 'recharts'
import type { HistoricalPoint } from '../../types/api'
import { buildRegimeBands } from '../../lib/chartUtils'

interface RegimeChartProps {
  data: HistoricalPoint[]
  showVix: boolean
}

const REGIME_COLORS: Record<string, string> = {
  calm: '#4ade80',
  elevated: '#fbbf24',
  turbulent: '#f87171',
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: HistoricalPoint; name: string; value: number }>
  label?: string
}

function RegimeTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const pt = payload[0].payload
  return (
    <div style={{ background: '#0c1020', border: '1px solid #151d2e', padding: '6px 10px', borderRadius: 6, fontSize: 10 }}>
      <div style={{ color: '#64748b', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: '#f1f5f9', marginBottom: 2 }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</div>
      ))}
      {pt.regime && (
        <div style={{ color: REGIME_COLORS[pt.regime] ?? '#94a3b8', textTransform: 'capitalize', marginTop: 4, fontWeight: 700 }}>
          {pt.regime}
        </div>
      )}
    </div>
  )
}

export default function RegimeChart({ data, showVix }: RegimeChartProps) {
  const bands = buildRegimeBands(data)

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#151d2e" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="spy"
          tick={{ fill: '#64748b', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        {showVix && (
          <YAxis
            yAxisId="vix"
            orientation="right"
            tick={{ fill: '#64748b', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            width={32}
            label={{ value: 'VIX', angle: -90, position: 'insideRight', fill: '#64748b', fontSize: 9 }}
          />
        )}
        <Tooltip content={<RegimeTooltip />} wrapperStyle={{ pointerEvents: 'none' }} />
        {bands.map((b, i) => (
          <ReferenceArea
            key={i}
            yAxisId="spy"
            x1={b.start}
            x2={b.end}
            fill={REGIME_COLORS[b.regime] ?? '#64748b'}
            fillOpacity={0.08}
          />
        ))}
        <Line
          yAxisId="spy"
          dataKey="close"
          stroke="#42a5f5"
          strokeWidth={2}
          dot={false}
          name="SPY"
        />
        {showVix && (
          <Line
            yAxisId="vix"
            dataKey="vix_level"
            stroke="#94a3b8"
            strokeWidth={1}
            dot={false}
            opacity={0.6}
            name="VIX"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
