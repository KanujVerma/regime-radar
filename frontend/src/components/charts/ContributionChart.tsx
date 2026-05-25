import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell, ResponsiveContainer } from 'recharts'
import ChartTooltip from './ChartTooltip'
import { colors } from '../../lib/tokens'

interface ContributionRow {
  label: string
  value: number
}

interface ContributionChartProps {
  data: ContributionRow[]
  onHover?: (label: string | null) => void
}

export default function ContributionChart({ data, onHover }: ContributionChartProps) {
  const sorted = [...data].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8)

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, sorted.length * 32)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 0 }}>
        <XAxis type="number" domain={['auto', 'auto']} tick={{ fill: colors.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" tick={{ fill: colors.textSecondary, fontSize: 11 }} axisLine={false} tickLine={false} width={140} />
        <ReferenceLine x={0} stroke={colors.border} strokeWidth={1.5} />
        <Tooltip
          content={(props) => (
            <ChartTooltip
              active={props.active}
              payload={props.payload as unknown as Array<{ value?: number | string | null; name?: string }>}
              label={props.label as string}
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
          onMouseEnter={(_data, _index, event) => {
            const label = (event.currentTarget as SVGElement | null)?.parentElement?.getAttribute('name')
            onHover?.(label ?? null)
          }}
          onMouseLeave={() => onHover?.(null)}
        >
          {sorted.map((entry, i) => (
            <Cell key={i} fill={entry.value >= 0 ? colors.red : colors.green} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
