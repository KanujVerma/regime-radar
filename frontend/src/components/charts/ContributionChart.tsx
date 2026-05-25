import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell, ResponsiveContainer } from 'recharts'
import ChartTooltip from './ChartTooltip'
import { colors } from '../../lib/tokens'

interface ContributionRow {
  name: string   // unique feature key
  label: string  // human-readable display
  value: number
}

interface ContributionChartProps {
  data: ContributionRow[]
  onHover?: (label: string | null) => void
}

export default function ContributionChart({ data, onHover }: ContributionChartProps) {
  const sorted = [...data].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8)

  const labelMap = Object.fromEntries(sorted.map(r => [r.name, r.label]))

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, sorted.length * 36)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 0 }}>
        <XAxis
          type="number"
          domain={['auto', 'auto']}
          tick={{ fill: colors.textDim, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={170}
          tick={(props) => {
            const { x, y, payload } = props as { x: number; y: number; payload: { value: string } }
            return (
              <text
                x={x - 4}
                y={y}
                textAnchor="end"
                fill={colors.textSecondary}
                fontSize={11}
                dominantBaseline="middle"
              >
                {labelMap[payload.value] ?? payload.value}
              </text>
            )
          }}
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine x={0} stroke={colors.border} strokeWidth={1.5} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={(props) => (
            <ChartTooltip
              active={props.active}
              payload={props.payload as unknown as Array<{ value?: number | string | null; name?: string }>}
              label={labelMap[(props.label as string)] ?? (props.label as string)}
              formatter={(v) => {
                const num = typeof v === 'number' ? v : Number(v)
                return num > 0 ? `+${num.toFixed(3)} (raises risk)` : `${num.toFixed(3)} (holds in check)`
              }}
            />
          )}
        />
        <Bar
          dataKey="value"
          radius={[0, 3, 3, 0]}
          onMouseEnter={(_data, index) => onHover?.(sorted[index]?.label ?? null)}
          onMouseLeave={() => onHover?.(null)}
        >
          {sorted.map((entry, i) => (
            <Cell key={i} fill={entry.value >= 0 ? colors.red : colors.green} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
