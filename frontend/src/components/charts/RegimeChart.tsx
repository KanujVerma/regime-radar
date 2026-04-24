import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea, CartesianGrid,
} from 'recharts'
import type { HistoricalPoint } from '../../types/api'

interface RegimeChartProps {
  data: HistoricalPoint[]
  showVix: boolean
}

const REGIME_COLORS: Record<string, string> = {
  calm: '#4ade80',
  elevated: '#fbbf24',
  turbulent: '#f87171',
}

function buildRegimeBands(data: HistoricalPoint[]) {
  const bands: { start: string; end: string; regime: string }[] = []
  let current: { start: string; regime: string } | null = null
  for (const pt of data) {
    if (!current || current.regime !== pt.regime) {
      if (current) bands.push({ ...current, end: pt.date })
      current = { start: pt.date, regime: pt.regime }
    }
  }
  if (current && data.length > 0) {
    bands.push({ ...current, end: data[data.length - 1].date })
  }
  return bands
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
        <Tooltip
          contentStyle={{ background: '#0c1020', border: '1px solid #151d2e', fontSize: 10 }}
          labelStyle={{ color: '#94a3b8' }}
        />
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
