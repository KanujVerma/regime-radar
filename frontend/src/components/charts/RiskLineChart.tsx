import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from 'recharts'
import type { HistoricalPoint } from '../../types/api'
import { DEFAULT_THRESHOLD, ALERT_THRESHOLD } from '../../lib/constants'

interface RiskLineChartProps {
  data: HistoricalPoint[]
}

export default function RiskLineChart({ data }: RiskLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#151d2e" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#475569', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          tick={{ fill: '#475569', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          domain={[0, 1]}
          width={40}
        />
        <Tooltip
          formatter={(v: unknown) => [`${(Number(v) * 100).toFixed(1)}%`, 'Risk']}
          contentStyle={{ background: '#0c1020', border: '1px solid #151d2e', fontSize: 10 }}
          labelStyle={{ color: '#94a3b8' }}
        />
        <ReferenceLine
          y={DEFAULT_THRESHOLD}
          stroke="#06b6d4"
          strokeDasharray="4 4"
          label={{ value: 'Watch (10%)', fill: '#06b6d4', fontSize: 8 }}
        />
        <ReferenceLine
          y={ALERT_THRESHOLD}
          stroke="#fbbf24"
          strokeDasharray="4 4"
          label={{ value: 'Alert (30%)', fill: '#fbbf24', fontSize: 8 }}
        />
        <Line dataKey="transition_risk" stroke="#06b6d4" strokeWidth={2} dot={false} name="Risk" />
      </LineChart>
    </ResponsiveContainer>
  )
}
