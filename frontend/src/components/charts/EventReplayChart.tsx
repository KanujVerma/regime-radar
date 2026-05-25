import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { EventReplayPoint } from '../../types/api'
import { DEFAULT_THRESHOLD } from '../../lib/constants'
import ChartTooltip from './ChartTooltip'
import RegimeBands from './RegimeBands'
import ChartAnnotation from './ChartAnnotation'
import { buildRegimeBands } from '../../lib/chartUtils'
import { colors } from '../../lib/tokens'

interface EventReplayChartProps {
  data: EventReplayPoint[]
  playheadDate?: string
  visibleUpTo?: string
}

export default function EventReplayChart({ data, playheadDate, visibleUpTo }: EventReplayChartProps) {
  const bands = buildRegimeBands(data, p => p.regime_actual, p => p.date)
  const firstCrossDate = data.find(p => (p.transition_risk ?? 0) > DEFAULT_THRESHOLD)?.date
  const transitions = data.filter(p => p.transition_actual)

  const displayData = visibleUpTo
    ? data.map(p => p.date <= visibleUpTo ? p : { ...p, transition_risk: null })
    : data

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={displayData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <RegimeBands bands={bands} />
        <XAxis dataKey="date" tick={{ fill: colors.textDim, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          tick={{ fill: colors.textDim, fontSize: 10 }}
          tickLine={false} axisLine={false} domain={[0, 1]} width={40}
        />
        <Tooltip
          content={(props) => (
            <ChartTooltip
              active={props.active}
              payload={props.payload as unknown as Array<{ value?: number | string | null | undefined; name?: string }>}
              label={props.label != null ? String(props.label) : undefined}
              accentColor={colors.cyan}
              formatter={(v) => `${(v * 100).toFixed(1)}%`}
            />
          )}
          wrapperStyle={{ pointerEvents: 'none' }}
        />
        <Line
          type="monotone"
          dataKey="transition_risk"
          stroke={colors.cyan}
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          animationDuration={400}
          name="Risk"
        />
        {firstCrossDate && (
          <ChartAnnotation x={firstCrossDate} label="Alert threshold crossed" side="right" color={colors.amber} />
        )}
        {transitions.slice(0, 3).map((t, i) => (
          <ChartAnnotation key={i} x={t.date} label="Regime change" side="left" color={colors.red} />
        ))}
        {playheadDate && (
          <ReferenceLine x={playheadDate} stroke={colors.textPrimary} strokeWidth={1.5} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
