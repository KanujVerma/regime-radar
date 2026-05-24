import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { HistoricalPoint } from '../../types/api'
import { DEFAULT_THRESHOLD, ALERT_THRESHOLD } from '../../lib/constants'
import ChartTooltip from './ChartTooltip'

interface RiskLineChartProps {
  data: HistoricalPoint[]
}

function riskColor(value: number): string {
  if (value > ALERT_THRESHOLD) return '#f87171'
  if (value > DEFAULT_THRESHOLD) return '#fbbf24'
  return '#4ade80'
}

export default function RiskLineChart({ data }: RiskLineChartProps) {
  const lastPoint = data[data.length - 1]
  const currentColor = lastPoint ? riskColor(lastPoint.transition_risk ?? 0) : '#06b6d4'

  return (
    <div style={{ position: 'relative' }}>
      {/* Reference line annotation badges — positioned above chart */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          color: '#fbbf24', background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.2)',
          borderRadius: 4, padding: '2px 7px',
        }}>
          Alert · {(ALERT_THRESHOLD * 100).toFixed(0)}%
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          color: '#06b6d4', background: 'rgba(6,182,212,0.08)',
          border: '1px solid rgba(6,182,212,0.2)',
          borderRadius: 4, padding: '2px 7px',
        }}>
          Watch · {(DEFAULT_THRESHOLD * 100).toFixed(0)}%
        </span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="riskAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={currentColor} stopOpacity={0.22} />
              <stop offset="100%" stopColor={currentColor} stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="date"
            tick={{ fill: '#4a6080', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            tick={{ fill: '#4a6080', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            domain={[0, 1]}
            width={38}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as unknown as { value?: number | string | null; name?: string }[]}
                label={typeof props.label === 'string' ? props.label : String(props.label ?? '')}
                accentColor={currentColor}
                formatter={(v) => `${(v * 100).toFixed(1)}%`}
                labelFormatter={(l) => `${l}`}
              />
            )}
            wrapperStyle={{ pointerEvents: 'none' }}
          />
          <ReferenceLine
            y={DEFAULT_THRESHOLD}
            stroke="#06b6d4"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
          />
          <ReferenceLine
            y={ALERT_THRESHOLD}
            stroke="#fbbf24"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
          />
          <Area
            dataKey="transition_risk"
            stroke={currentColor}
            strokeWidth={2.5}
            fill="url(#riskAreaGradient)"
            dot={false}
            activeDot={(props: { cx?: number; cy?: number }) => (
              <g>
                <circle cx={props.cx} cy={props.cy} r={8} fill={currentColor} fillOpacity={0.18} />
                <circle cx={props.cx} cy={props.cy} r={4} fill={currentColor} />
              </g>
            )}
            isAnimationActive={true}
            animationDuration={800}
            animationEasing="ease-out"
            name="Risk"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
