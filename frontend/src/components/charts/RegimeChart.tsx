import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea, ReferenceLine, Brush,
} from 'recharts'
import type { HistoricalPoint } from '../../types/api'
import { buildHistoricalBands } from '../../lib/chartUtils'
import ChartTooltip from './ChartTooltip'
import { colors } from '../../lib/tokens'
import ChartAnnotation from './ChartAnnotation'

interface RegimeChartProps {
  data: HistoricalPoint[]
  showVix: boolean
  syncHoverX?: string | null
  onSyncHoverX?: (x: string | null) => void
  pinnedDate?: string | null
}

const REGIME_COLORS: Record<string, string> = {
  calm: '#4ade80',
  elevated: '#fbbf24',
  turbulent: '#f87171',
}


export default function RegimeChart({ data, showVix, syncHoverX, onSyncHoverX, pinnedDate }: RegimeChartProps) {
  const bands = buildHistoricalBands(data)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
        onMouseMove={(e) => {
          const date = e?.activeLabel as string | undefined
          if (date) onSyncHoverX?.(date)
        }}
        onMouseLeave={() => onSyncHoverX?.(null)}
      >
        <defs>
          <linearGradient id="spyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
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
          yAxisId="spy"
          tick={{ fill: '#4a6080', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        {showVix && (
          <YAxis
            yAxisId="vix"
            orientation="right"
            tick={{ fill: '#4a6080', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={32}
            label={{ value: 'VIX', angle: -90, position: 'insideRight', fill: '#64748b', fontSize: 9 }}
          />
        )}
        <Tooltip
          content={(props) => (
            <ChartTooltip
              active={props.active}
              payload={props.payload as unknown as Array<{ value?: number | string | null; name?: string; color?: string }>}
              label={props.label as string}
              formatter={(v, name) => name === 'VIX' ? v.toFixed(1) : v.toFixed(0)}
              labelFormatter={l => l}
            />
          )}
          wrapperStyle={{ pointerEvents: 'none' }}
        />
        {bands.map((b, i) => (
          <ReferenceArea
            key={i}
            yAxisId="spy"
            x1={b.start}
            x2={b.end}
            fill={REGIME_COLORS[b.regime] ?? '#64748b'}
            fillOpacity={0.18}
          />
        ))}
        {syncHoverX && (
          <ReferenceLine
            yAxisId="spy"
            x={syncHoverX}
            stroke={colors.textSecondary}
            strokeDasharray="3 3"
            strokeOpacity={0.5}
          />
        )}
        <Area
          yAxisId="spy"
          dataKey="close"
          fill="url(#spyGradient)"
          stroke="#06b6d4"
          strokeWidth={1.5}
          dot={false}
          name="SPY"
          isAnimationActive={true}
          animationDuration={800}
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
        {pinnedDate && (
          <ChartAnnotation
            x={pinnedDate}
            label={pinnedDate}
            description="Notable day"
            side="right"
            color={colors.cyan}
          />
        )}
        <Brush
          dataKey="date"
          height={20}
          stroke={colors.border}
          fill={colors.surfaceElevated}
          travellerWidth={6}
          startIndex={0}
          endIndex={data.length > 0 ? data.length - 1 : 0}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
