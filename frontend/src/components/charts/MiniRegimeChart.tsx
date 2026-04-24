import {
  ComposedChart, Line, XAxis, YAxis, ResponsiveContainer,
  ReferenceArea, ReferenceLine,
} from 'recharts'
import type { HistoricalPoint } from '../../types/api'
import { buildRegimeBands } from '../../lib/chartUtils'

interface MiniRegimeChartProps {
  data: HistoricalPoint[]
}

const REGIME_COLORS: Record<string, string> = {
  calm: '#4ade80',
  elevated: '#fbbf24',
  turbulent: '#f87171',
}

export default function MiniRegimeChart({ data }: MiniRegimeChartProps) {
  if (data.length === 0) return null

  const bands = buildRegimeBands(data)
  const todayDate = data[data.length - 1].date

  return (
    <ResponsiveContainer width="100%" height={120}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <XAxis dataKey="date" hide />
        <YAxis yAxisId="spy" hide />
        {bands.map((b, i) => (
          <ReferenceArea
            key={i}
            yAxisId="spy"
            x1={b.start}
            x2={b.end}
            fill={REGIME_COLORS[b.regime] ?? '#64748b'}
            fillOpacity={0.12}
          />
        ))}
        <Line
          yAxisId="spy"
          dataKey="close"
          stroke="#42a5f5"
          strokeWidth={1.5}
          dot={false}
          name="SPY"
          isAnimationActive={false}
        />
        <ReferenceLine
          yAxisId="spy"
          x={todayDate}
          stroke="#06b6d4"
          strokeWidth={1}
          strokeDasharray="3 3"
          label={{ value: 'Today', position: 'insideTopRight', fill: '#06b6d4', fontSize: 8 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
