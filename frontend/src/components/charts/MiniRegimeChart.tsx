import {
  ComposedChart, Line, XAxis, YAxis, ResponsiveContainer,
  ReferenceArea, ReferenceLine, Tooltip,
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

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: HistoricalPoint }>
  label?: string
}

function MiniTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const pt = payload[0].payload
  return (
    <div style={{ background: '#0c1020', border: '1px solid #151d2e', padding: '6px 10px', borderRadius: 6, fontSize: 10 }}>
      <div style={{ color: '#64748b', marginBottom: 3 }}>{label}</div>
      <div style={{ color: '#f1f5f9' }}>SPY {pt.close != null ? `$${pt.close.toFixed(2)}` : '—'}</div>
      <div style={{ color: REGIME_COLORS[pt.regime] ?? '#94a3b8', textTransform: 'capitalize', marginTop: 2 }}>{pt.regime}</div>
    </div>
  )
}

function LastDot(props: { cx?: number; cy?: number; index?: number; dataLength: number }) {
  const { cx = 0, cy = 0, index = 0, dataLength } = props
  if (index !== dataLength - 1) return null
  return <circle cx={cx} cy={cy} r={3.5} fill="#06b6d4" stroke="#080b12" strokeWidth={1.5} />
}

export default function MiniRegimeChart({ data }: MiniRegimeChartProps) {
  if (data.length === 0) return null

  const bands = buildRegimeBands(data)
  const todayDate = data[data.length - 1].date

  return (
    <ResponsiveContainer width="100%" height={120}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="date" hide />
        <YAxis yAxisId="spy" hide />
        <Tooltip content={<MiniTooltip />} />
        {bands.map((b, i) => (
          <ReferenceArea
            key={i}
            yAxisId="spy"
            x1={b.start}
            x2={b.end}
            fill={REGIME_COLORS[b.regime] ?? '#64748b'}
            fillOpacity={0.14}
          />
        ))}
        <Line
          yAxisId="spy"
          dataKey="close"
          stroke="#42a5f5"
          strokeWidth={2}
          dot={(props: { cx?: number; cy?: number; index?: number }) => (
            <LastDot key={`dot-${props.index}`} {...props} dataLength={data.length} />
          )}
          activeDot={{ r: 3, fill: '#42a5f5', strokeWidth: 0 }}
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
