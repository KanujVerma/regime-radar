import { motion } from 'framer-motion'
import type { StateDelta } from '../types/api'
import { useCurrentState } from '../hooks/useCurrentState'
import { useModelDrivers } from '../hooks/useModelDrivers'
import { useHistoricalState } from '../hooks/useHistoricalState'
import MiniRegimeChart from '../components/charts/MiniRegimeChart'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import MetricCard from '../components/ui/MetricCard'
import RegimeBadge from '../components/ui/RegimeBadge'
import DriverBar from '../components/ui/DriverBar'
import { buildCurrentStateNarrative, formatRisk } from '../lib/narratives'
import RegimeLegend from '../components/ui/RegimeLegend'
import { regimeColor } from '../lib/tokens'
import { labelFor } from '../lib/featureLabels'

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.2 } }),
}

export default function CurrentState() {
  const { data, loading, error, refresh } = useCurrentState()
  const { data: drivers } = useModelDrivers()
  const { data: recentData, loading: recentLoading } = useHistoricalState('2020-01-01')

  if (loading) return <div className="p-6 text-slate-500 text-sm">Loading…</div>
  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>
  if (!data) return null

  const regime = data.regime.toLowerCase()
  const rColor = regimeColor[regime] ?? regimeColor['unknown']
  const narrative = buildCurrentStateNarrative(
    data.regime, data.transition_risk, data.trend, data.vix_level, data.vix_chg_1d,
  )

  const topDrivers = data.top_drivers.length > 0
    ? data.top_drivers
    : drivers?.global_importance.slice(0, 5) ?? []
  const maxImp = Math.max(...topDrivers.map(d => d.importance), 0.001)

  const refreshAction = (
    <button
      onClick={refresh}
      className="text-[10px] font-bold px-3 py-1.5 rounded"
      style={{ background: '#0c1020', border: '1px solid #151d2e', color: '#06b6d4' }}
    >
      ↻ Refresh Data
    </button>
  )

  const heroCards = [
    { label: 'Market Regime', value: data.regime, color: rColor, subtitle: 'Current stress level' },
    {
      label: 'Transition Risk',
      value: formatRisk(data.transition_risk),
      color: data.transition_risk > 0.40 ? '#f87171' : data.transition_risk > 0.20 ? '#fbbf24' : '#4ade80',
      subtitle: 'Chance conditions worsen this week',
    },
    { label: 'VIX Level', value: data.vix_level != null ? data.vix_level.toFixed(1) : '—', color: '#f1f5f9', subtitle: 'Market fear gauge' },
    { label: 'Trend', value: data.trend.replace('trend', ''), color: '#94a3b8', subtitle: 'Recent price direction' },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar
        title="Current State"
        subtitle={data.as_of_ts ? `As of ${new Date(data.as_of_ts).toLocaleString()}` : undefined}
        action={refreshAction}
      />

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-4 gap-3">
          {heroCards.map((card, i) => (
            <motion.div key={card.label} custom={i} variants={cardVariants} initial="hidden" animate="visible">
              <MetricCard label={card.label} value={card.value} valueColor={card.color} subtitle={card.subtitle} />
            </motion.div>
          ))}
        </div>

        <div className="h-px" style={{ background: '#151d2e' }} />

        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 320px' }}>
          <div className="space-y-4">
            <Panel title="What this means right now">
              <p className="text-[11px] leading-relaxed mb-4" style={{ color: '#94a3b8' }}>{narrative}</p>
              <div className="flex gap-2">
                {(['calm', 'elevated', 'turbulent'] as const).map(r => {
                  const prob = (data as unknown as Record<string, unknown>)[`prob_${r}`] as number | null
                  if (prob == null) return null
                  return <RegimeBadge key={r} regime={r} probability={prob} />
                })}
              </div>
            </Panel>

            {data.delta && (
              <Panel title="Why it changed since last refresh">
                <DeltaRows delta={data.delta} />
              </Panel>
            )}

            {recentLoading ? (
              <Panel title="Last 30 Trading Days">
                <div className="h-[120px] rounded" style={{ background: '#0c1020' }} />
              </Panel>
            ) : recentData && recentData.data.length > 0 ? (
              <Panel title="Last 30 Trading Days">
                <div className="mb-2">
                  <RegimeLegend />
                </div>
                <p className="text-[10px] mb-2" style={{ color: '#64748b' }}>
                  Recent price path with market-state shading.
                </p>
                <MiniRegimeChart data={recentData.data.slice(-30)} />
              </Panel>
            ) : null}
          </div>

          <div className="space-y-4">
            <Panel title="Transition risk gauge">
              <GaugeArc risk={data.transition_risk} regime={regime} />
            </Panel>
            <Panel title="What is pushing risk right now">
              <p className="text-[10px] mb-3" style={{ color: '#64748b' }}>
                Features currently exerting the strongest influence on the model's risk estimate.
              </p>
              {topDrivers.slice(0, 5).map(d => (
                <DriverBar key={d.feature} feature={d.feature} importance={d.importance} maxImportance={maxImp} positive />
              ))}
            </Panel>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function DeltaRows({ delta }: { delta: StateDelta }) {
  const noMeaningfulChange =
    Math.abs(delta.risk_delta) < 0.001 && !delta.regime_changed && !delta.top_feature_moved

  if (noMeaningfulChange) {
    return (
      <p className="text-[11px]" style={{ color: '#64748b' }}>
        No meaningful change since the last refresh — risk, regime, and key drivers all remained stable.
      </p>
    )
  }

  const rows = [
    {
      icon: delta.risk_delta > 0.01 ? '📈' : delta.risk_delta < -0.01 ? '📉' : '↔️',
      text: `Transition risk ${delta.risk_delta > 0.01 ? 'increased' : delta.risk_delta < -0.01 ? 'decreased' : 'unchanged'} by ${Math.abs(delta.risk_delta * 100).toFixed(1)}pp`,
      badge: delta.risk_delta > 0.01 ? 'Risk ↑' : delta.risk_delta < -0.01 ? 'Risk ↓' : 'No change',
      positive: delta.risk_delta < 0,
    },
    delta.regime_changed && delta.prior_regime
      ? { icon: '🔄', text: `Regime shifted from ${delta.prior_regime} to current`, badge: 'Changed', positive: false }
      : null,
    delta.top_feature_moved
      ? {
          icon: delta.top_feature_direction === 'up' ? '↑' : '↓',
          text: `${labelFor(delta.top_feature_moved)} moved ${delta.top_feature_direction ?? ''}`,
          badge: '',
          positive: delta.top_feature_direction === 'down',
        }
      : null,
  ].filter((r): r is NonNullable<typeof r> => r !== null)

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span>{row.icon}</span>
          <span style={{ color: '#94a3b8', flex: 1 }}>{row.text}</span>
          {row.badge && (
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded"
              style={{
                background: row.positive ? '#052e1620' : '#450a0a20',
                color: row.positive ? '#4ade80' : '#f87171',
              }}
            >
              {row.badge}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function GaugeArc({ risk, regime }: { risk: number; regime: string }) {
  const pct = Math.min(risk, 1)
  const angle = pct * 180 - 90
  const color = risk < 0.20 ? '#4ade80' : risk < 0.40 ? '#fbbf24' : '#f87171'
  const isStressed = regime === 'elevated' || regime === 'turbulent'
  const caption =
    risk < 0.05
      ? isStressed
        ? 'Conditions are stressed, but further deterioration this week is unlikely.'
        : 'Very low risk — conditions appear stable.'
      : risk < 0.20
      ? isStressed
        ? 'Current stress is present; near-term worsening risk is low.'
        : 'Low risk — conditions appear stable.'
      : risk < 0.40
      ? 'Moderate risk — conditions could worsen within the next week.'
      : 'Elevated risk — model sees meaningful stress probability.'

  // cy=90 puts arc center at bottom edge so semi-circle fits in 110px height
  const cx = 80, cy = 90, r = 55
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const x1 = cx + r * Math.cos(toRad(-180))
  const y1 = cy + r * Math.sin(toRad(-180))
  const x2 = cx + r * Math.cos(toRad(0))
  const y2 = cy + r * Math.sin(toRad(0))
  const nx = cx + r * Math.cos(toRad(angle))
  const ny = cy + r * Math.sin(toRad(angle))

  // Suppress unused variable warnings for x2/y2 (background arc endpoint)
  void x2; void y2

  return (
    <div className="flex flex-col items-center">
      <svg width={160} height={110} viewBox="0 0 160 110">
        <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#151d2e" strokeWidth={8} />
        <path
          d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${nx} ${ny}`}
          fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
        />
        <text x={cx} y={cy - 10} textAnchor="middle" fill={color} fontSize={18} fontWeight={800}>
          {formatRisk(risk)}
        </text>
        <text x={cx} y={cy + 6} textAnchor="middle" fill="#64748b" fontSize={8}>
          Transition Risk
        </text>
      </svg>
      <p className="text-[10px] text-center mt-1 leading-relaxed" style={{ color: '#64748b', maxWidth: 220 }}>{caption}</p>
    </div>
  )
}
