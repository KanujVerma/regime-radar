import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea,
} from 'recharts'
import type { HistoricalPoint } from '../../types/api'
import { buildHistoricalBands } from '../../lib/chartUtils'

interface RegimeChartProps {
  data: HistoricalPoint[]
  showVix: boolean
}

const REGIME_COLORS: Record<string, string> = {
  calm: '#4ade80',
  elevated: '#fbbf24',
  turbulent: '#f87171',
}


export default function RegimeChart({ data, showVix }: RegimeChartProps) {
  const bands = buildHistoricalBands(data)

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
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
          content={(props) => {
            if (!props.active || !props.payload?.length) return null
            const pt = props.payload[0]?.payload as HistoricalPoint
            if (!pt) return null
            return (
              <div style={{
                background: 'rgba(8,11,24,0.97)',
                border: '1px solid #1e3a5f',
                borderLeft: `3px solid ${REGIME_COLORS[pt.regime] ?? '#94a3b8'}`,
                borderRadius: 8,
                padding: '10px 14px',
                pointerEvents: 'none',
              }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{pt.date}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: REGIME_COLORS[pt.regime] ?? '#94a3b8', textTransform: 'capitalize' }}>
                  {pt.regime}
                </div>
                {pt.close != null && (
                  <div style={{ fontSize: 12, color: '#f1f5f9', marginTop: 2 }}>
                    SPY ${pt.close.toFixed(2)}
                  </div>
                )}
                {pt.transition_risk != null && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Risk: {(pt.transition_risk * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            )
          }}
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
      </ComposedChart>
    </ResponsiveContainer>
  )
}
