import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea, ReferenceLine, CartesianGrid,
} from 'recharts'
import type { EventReplayPoint } from '../../types/api'
import { DEFAULT_THRESHOLD } from '../../lib/constants'

const REGIME_COLORS: Record<string, string> = {
  calm: '#4ade80',
  elevated: '#fbbf24',
  turbulent: '#f87171',
}

function buildBands(data: EventReplayPoint[]) {
  const bands: { start: string; end: string; regime: string }[] = []
  let cur: { start: string; regime: string } | null = null
  for (const pt of data) {
    const r = pt.regime_actual
    if (!cur || cur.regime !== r) {
      if (cur) bands.push({ ...cur, end: pt.date })
      cur = { start: pt.date, regime: r }
    }
  }
  if (cur && data.length) bands.push({ ...cur, end: data[data.length - 1].date })
  return bands
}

interface DotProps {
  cx?: number
  cy?: number
  payload?: EventReplayPoint
}

function ActualTransitionDot({ cx = 0, cy = 0, payload }: DotProps) {
  if (!payload?.transition_actual) return null
  return (
    <text x={cx} y={cy} textAnchor="middle" fill="#f87171" fontSize={8}>✕</text>
  )
}

export default function EventReplayChart({ data }: { data: EventReplayPoint[] }) {
  const bands = buildBands(data)
  const firstCrossDate = data.find(p => (p.transition_risk ?? 0) > DEFAULT_THRESHOLD)?.date

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#151d2e" />
        <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          tick={{ fill: '#475569', fontSize: 9 }}
          tickLine={false} axisLine={false} domain={[0, 1]} width={40}
        />
        <Tooltip
          contentStyle={{ background: '#0c1020', border: '1px solid #151d2e', fontSize: 10 }}
          formatter={(v: unknown, name?: string | number) => {
            if (name === 'transition_risk') return [`${(Number(v) * 100).toFixed(1)}%`, 'Risk']
            return [String(v), String(name ?? '')]
          }}
        />
        {bands.map((b, i) => (
          <ReferenceArea
            key={i} x1={b.start} x2={b.end}
            fill={REGIME_COLORS[b.regime] ?? '#475569'} fillOpacity={0.1}
          />
        ))}
        {firstCrossDate && (
          <ReferenceLine x={firstCrossDate} stroke="#06b6d4" strokeDasharray="4 4" />
        )}
        <Line dataKey="transition_risk" stroke="#06b6d4" strokeWidth={2} dot={false} name="transition_risk" />
        <Line
          dataKey="transition_actual"
          stroke="#f87171"
          strokeWidth={0}
          dot={(props: DotProps) => <ActualTransitionDot key={`dot-${props.cx}-${props.cy}`} {...props} />}
          name="Actual transition"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
