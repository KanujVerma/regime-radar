import { motion } from 'framer-motion'
import type { StateDelta, DailyDiffResponse } from '../types/api'
import { useCurrentState } from '../hooks/useCurrentState'
import { useModelDrivers } from '../hooks/useModelDrivers'
import { useHistoricalState } from '../hooks/useHistoricalState'
import { useReliability } from '../hooks/useReliability'
import { useDailyDiff } from '../hooks/useDailyDiff'
import MiniRegimeChart from '../components/charts/MiniRegimeChart'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import MetricCard from '../components/ui/MetricCard'
import RegimeBadge from '../components/ui/RegimeBadge'
import DriverBar from '../components/ui/DriverBar'
import { buildCurrentStateNarrative, formatRisk } from '../lib/narratives'
import { reliabilityFor, reliabilityLine } from '../lib/reliability'
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
  const { data: reliabilityTable } = useReliability()
  const { data: dailyDiff } = useDailyDiff()

  if (loading) return <div className="p-6 text-slate-500 text-sm">Loading…</div>
  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>
  if (!data) return null

  const regime = data.regime.toLowerCase()
  const rColor = regimeColor[regime] ?? regimeColor['unknown']

  const reliability = reliabilityTable
    ? reliabilityFor(data.transition_risk, reliabilityTable)
    : null

  const narrative = buildCurrentStateNarrative(
    data.regime, data.transition_risk, data.trend, data.vix_level, data.vix_chg_1d,
    reliability?.out_of_range,
  )

  // top_drivers from /current-state are risk-raising (positive SHAP) contributors.
  // Fall back to global importance only if SHAP failed (with a note to the UI).
  const usingLiveDrivers = data.top_drivers.length > 0
  const topDrivers = usingLiveDrivers
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

  const riskColor = data.transition_risk > 0.40 ? '#f87171' : data.transition_risk > 0.20 ? '#fbbf24' : '#4ade80'

  // Regime is the hero — shown first and most prominent.
  // Transition risk is secondary and always accompanied by its track record.
  const heroCards = [
    { label: 'Market Regime', value: data.regime, color: rColor, subtitle: 'Current market stress level' },
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

      {data.mode === 'demo' && (
        <div
          className="mx-5 mt-3 px-4 py-2.5 rounded text-[11px] leading-relaxed"
          style={{ background: '#2d1f0a', border: '1px solid #92400e', color: '#fbbf24' }}
        >
          <strong>Demo mode</strong> — Using cached snapshot data (as of {data.as_of_ts ? new Date(data.as_of_ts).toLocaleDateString() : 'unknown'}). Live refresh unavailable.
        </div>
      )}

      <div className="p-5 space-y-5">
        {/* Regime is the primary hero; transition risk gets its own evidence-anchored row below */}
        <div className="grid grid-cols-3 gap-3">
          {heroCards.map((card, i) => (
            <motion.div key={card.label} custom={i} variants={cardVariants} initial="hidden" animate="visible">
              <MetricCard label={card.label} value={card.value} valueColor={card.color} subtitle={card.subtitle} />
            </motion.div>
          ))}
        </div>

        {/* Transition risk — always shown with its empirical track record, never naked */}
        <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
          <div
            className="rounded-lg px-4 py-3"
            style={{ background: '#080d18', border: '1px solid #151d2e' }}
          >
            <div className="flex items-start gap-4 flex-wrap">
              <div className="min-w-[120px]">
                <div className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: '#4a6080' }}>
                  Odds of worsening (next 5 trading days)
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold" style={{ color: riskColor }}>
                    {formatRisk(data.transition_risk)}
                  </span>
                  {reliability?.out_of_range && (
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded"
                      style={{ background: '#2d1500', border: '1px solid #78350f', color: '#fbbf24' }}
                    >
                      ⚠ OUT OF RANGE
                    </span>
                  )}
                </div>
              </div>
              {reliability && (
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[10px] leading-relaxed" style={{ color: '#64748b' }}>
                    {reliabilityLine(reliability)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {dailyDiff && (
          <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
            <DailyDiffBlock diff={dailyDiff} />
          </motion.div>
        )}

        <div className="h-px" style={{ background: '#151d2e' }} />

        <div className="grid gap-4 items-stretch" style={{ gridTemplateColumns: '1fr 320px' }}>
          <div className="flex flex-col gap-4">
            <Panel title="What this means right now">
              <p className="text-[11px] leading-relaxed mb-4" style={{ color: '#94a3b8' }}>{narrative}</p>
              <div className="text-[9px] font-bold tracking-widest uppercase mb-2" style={{ color: '#4a6080' }}>
                Model confidence in each market state
              </div>
              <div className="flex gap-2 mb-4">
                {(['calm', 'elevated', 'turbulent'] as const).map(r => {
                  const prob = (data as unknown as Record<string, unknown>)[`prob_${r}`] as number | null
                  if (prob == null) return null
                  return <RegimeBadge key={r} regime={r} probability={prob} />
                })}
              </div>
              {data.delta && (
                <>
                  <div className="h-px mb-4" style={{ background: '#131b2a' }} />
                  <div className="text-[9px] font-bold tracking-widest uppercase mb-3" style={{ color: '#4a6080' }}>
                    Since last refresh
                  </div>
                  <DeltaRows delta={data.delta} currentRegime={data.regime} />
                </>
              )}
            </Panel>

            {recentLoading ? (
              <Panel title="Last 30 Trading Days" className="flex-1 flex flex-col">
                <div className="flex-1 rounded" style={{ background: '#080b12', minHeight: 165 }} />
              </Panel>
            ) : recentData && recentData.data.length > 0 ? (
              <Panel title="Last 30 Trading Days" className="flex-1 flex flex-col">
                <div className="mb-2">
                  <RegimeLegend />
                </div>
                <p className="text-[10px] mb-3" style={{ color: '#94a3b8' }}>
                  Recent price path with market-state shading.
                </p>
                <div className="flex-1" style={{ minHeight: 165 }}>
                  <MiniRegimeChart data={recentData.data.slice(-30)} height={165} />
                </div>
              </Panel>
            ) : null}
          </div>

          <div className="flex flex-col gap-4">
            <Panel title="Transition risk gauge">
              <GaugeArc risk={data.transition_risk} regime={regime} outOfRange={reliability?.out_of_range ?? false} />
            </Panel>
            <Panel title="What is raising risk right now" className="flex-1">
              <p className="text-[10px] mb-3" style={{ color: '#94a3b8' }}>
                {usingLiveDrivers
                  ? 'Features with the largest positive (risk-raising) SHAP contribution today. This is not the full driver picture — risk-lowering signals are excluded.'
                  : 'Global model feature importance (live SHAP unavailable). Not specific to today\'s reading.'}
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

function DeltaRows({ delta, currentRegime }: { delta: StateDelta; currentRegime: string }) {
  const noMeaningfulChange =
    Math.abs(delta.risk_delta) < 0.001 && !delta.regime_changed && !delta.top_feature_moved

  if (noMeaningfulChange) {
    return (
      <p className="text-[11px]" style={{ color: '#94a3b8' }}>
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
      ? { icon: '🔄', text: `Regime shifted from ${delta.prior_regime} to ${currentRegime}`, badge: 'Changed', positive: false }
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

function GaugeArc({ risk, regime, outOfRange }: { risk: number; regime: string; outOfRange: boolean }) {
  const pct = Math.min(risk, 1)
  const angle = pct * 180 - 180
  const color = risk < 0.20 ? '#4ade80' : risk < 0.40 ? '#fbbf24' : '#f87171'
  const isStressed = regime === 'elevated' || regime === 'turbulent'
  const caption = outOfRange
    ? 'Reading is outside the model\'s historically evaluated range — treat as a directional signal, not a calibrated probability.'
    : risk < 0.05
      ? isStressed
        ? 'Conditions are stressed, but further deterioration over the next 5 trading days is unlikely.'
        : 'Very low odds — conditions appear stable.'
      : risk < 0.20
      ? isStressed
        ? 'Current stress is present; near-term worsening odds are low.'
        : 'Low odds — conditions appear stable.'
      : risk < 0.40
      ? 'Moderate odds — conditions could worsen over the next 5 trading days.'
      : 'Elevated odds — model sees meaningful stress probability over the next 5 trading days.'

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
      <p className="text-[10px] text-center mt-1 leading-relaxed" style={{ color: '#94a3b8', maxWidth: 220 }}>{caption}</p>
    </div>
  )
}

function DailyDiffBlock({ diff: response }: { diff: DailyDiffResponse }) {
  const { diff, metadata } = response

  const prevDate = new Date(metadata.previous_date + 'T12:00:00Z')
  const prevFormatted = prevDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const label = metadata.gap_days === 1
    ? `Since last trading day (${prevDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${prevFormatted})`
    : `Compared with snapshot as of ${prevFormatted}`

  const rows: { icon: string; text: string; calming: boolean }[] = []

  if (diff.regime_changed && diff.prior_regime) {
    rows.push({ icon: '🔄', text: `Regime shifted from ${diff.prior_regime} → ${response.current.regime}`, calming: false })
  }

  if (Math.abs(diff.risk_delta) >= 0.01) {
    const up = diff.risk_delta > 0
    rows.push({ icon: up ? '📈' : '📉', text: `Transition risk ${up ? '+' : ''}${(diff.risk_delta * 100).toFixed(1)}pp`, calming: !up })
  }

  if (diff.vix_delta !== null && Math.abs(diff.vix_delta) >= 0.5) {
    const up = diff.vix_delta > 0
    rows.push({ icon: up ? '↑' : '↓', text: `VIX ${up ? '+' : ''}${diff.vix_delta.toFixed(1)}`, calming: !up })
  }

  if (diff.top_driver_changed && diff.prior_top_driver && diff.current_top_driver) {
    rows.push({ icon: '⇄', text: `Top risk driver: ${diff.prior_top_driver.plain_label} → ${diff.current_top_driver.plain_label}`, calming: false })
  }

  return (
    <div className="rounded-lg px-4 py-3" style={{ background: '#080d18', border: '1px solid #151d2e' }}>
      <div className="text-[9px] font-bold tracking-widest uppercase mb-2" style={{ color: '#4a6080' }}>
        {label}
      </div>

      {metadata.is_stale && (
        <p className="text-[9px] mb-2" style={{ color: '#92400e' }}>
          Snapshot is unusually old — comparison may not reflect recent conditions
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-[11px]" style={{ color: '#64748b' }}>
          No notable market-state change since the last snapshot.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span>{row.icon}</span>
              <span style={{ color: row.calming ? '#4ade80' : '#94a3b8', flex: 1 }}>{row.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
