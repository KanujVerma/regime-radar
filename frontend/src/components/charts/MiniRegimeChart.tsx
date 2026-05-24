import {
  ComposedChart, Line, XAxis, YAxis, ResponsiveContainer,
  ReferenceLine, ReferenceDot, Tooltip,
} from 'recharts'
import type { HistoricalPoint } from '../../types/api'
import { buildHistoricalBands } from '../../lib/chartUtils'
import ChartTooltip from './ChartTooltip'

interface MiniRegimeChartProps {
  data: HistoricalPoint[]
  height?: number
}

// RGBA variants for CSS gradient (immune to SVG fill-opacity rendering quirks)
const REGIME_CSS: Record<string, string> = {
  calm: 'rgba(74, 222, 128, 0.18)',
  elevated: 'rgba(251, 191, 36, 0.18)',
  turbulent: 'rgba(248, 113, 113, 0.18)',
}


function buildCssGradient(bands: ReturnType<typeof buildHistoricalBands>, data: HistoricalPoint[]): string {
  const total = data.length - 1
  if (total <= 0) return 'transparent'

  const stops: string[] = []
  for (const b of bands) {
    const startIdx = data.findIndex(d => d.date === b.start)
    const endIdx = data.findIndex(d => d.date === b.end)
    const startPct = ((startIdx / total) * 100).toFixed(2)
    const endPct = ((endIdx / total) * 100).toFixed(2)
    const color = REGIME_CSS[b.regime] ?? 'rgba(100,116,139,0.15)'
    stops.push(`${color} ${startPct}%`, `${color} ${endPct}%`)
  }

  return `linear-gradient(to right, ${stops.join(', ')})`
}

export default function MiniRegimeChart({ data, height = 120 }: MiniRegimeChartProps) {
  if (data.length === 0) return null

  const bands = buildHistoricalBands(data)
  const last = data[data.length - 1]
  const gradient = buildCssGradient(bands, data)

  return (
    // chart margin is right:8, left:0 — right:8px matches that offset
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: '4px 8px 0 0',
        background: gradient,
        borderRadius: 2,
        pointerEvents: 'none',
      }} />
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis yAxisId="spy" hide />
          <Tooltip
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as unknown as Array<{ value?: number | string | null; name?: string; color?: string }>}
                label={props.label as string}
                formatter={(v) => `$${v.toFixed(2)}`}
                labelFormatter={l => l}
              />
            )}
          />
          <Line
            yAxisId="spy"
            dataKey="close"
            stroke="#42a5f5"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: '#42a5f5', strokeWidth: 0 }}
            name="SPY"
            isAnimationActive={false}
          />
          <ReferenceLine
            yAxisId="spy"
            x={last.date}
            stroke="#06b6d4"
            strokeWidth={1}
            strokeDasharray="3 3"
            label={{ value: 'Today', position: 'insideTopRight', fill: '#06b6d4', fontSize: 8 }}
          />
          {last.close != null && (
            <ReferenceDot
              yAxisId="spy"
              x={last.date}
              y={last.close}
              r={3.5}
              fill="#06b6d4"
              stroke="#080b12"
              strokeWidth={1.5}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
