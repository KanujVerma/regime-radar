import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useCurrentState } from '../hooks/useCurrentState'
import { useHistoricalState } from '../hooks/useHistoricalState'
import { useReliability } from '../hooks/useReliability'
import { useDailyDiff } from '../hooks/useDailyDiff'
import MiniRegimeChart from '../components/charts/MiniRegimeChart'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import RegimeBadge from '../components/ui/RegimeBadge'
import SkeletonBlock from '../components/ui/SkeletonBlock'
import { buildCurrentStateNarrative } from '../lib/narratives'
import { reliabilityFor } from '../lib/reliability'
import RiskTemperature from '../components/current-state/RiskTemperature'
import WhatChanged from '../components/current-state/WhatChanged'
import StressLadder from '../components/current-state/StressLadder'
import MarketContextBrief from '../components/current-state/MarketContextBrief'
import {
  buildMarketContextCards,
  buildRiskTemperature,
  buildStressLadderRows,
  buildWhatChangedRows,
} from '../lib/currentStateBriefing'
import { regimeColor, colors } from '../lib/tokens'

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  }),
}

export default function CurrentState() {
  const { data, loading, error, refresh } = useCurrentState()
  const { data: recentData } = useHistoricalState('2020-01-01')
  const { data: reliabilityTable } = useReliability()
  const { data: dailyDiffData } = useDailyDiff()

  if (loading) return (
    <div className="px-6 py-5 space-y-6">
      <SkeletonBlock height="160px" rounded={12} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SkeletonBlock height="72px" />
        <SkeletonBlock height="72px" />
        <SkeletonBlock height="72px" />
      </div>
      <SkeletonBlock height="80px" />
      <SkeletonBlock height="200px" />
    </div>
  )
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

  const refreshAction = (
    <button
      onClick={refresh}
      disabled={loading}
      className="text-[10px] font-bold px-3 py-1.5 rounded flex items-center gap-1.5"
      style={{
        background: '#0c1020',
        border: '1px solid #151d2e',
        color: '#06b6d4',
        opacity: loading ? 0.5 : 1,
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'opacity 150ms',
      }}
    >
      <span className={loading ? 'spin' : ''}>↻</span>
      Refresh
    </button>
  )

  const historicalPoints = recentData?.data ?? []
  const riskTemperature = buildRiskTemperature(data.transition_risk, historicalPoints)
  const whatChangedRows = buildWhatChangedRows(data, dailyDiffData)
  const stressLadderRows = buildStressLadderRows(data.condition_values ?? {}, dailyDiffData)
  const marketContextCards = buildMarketContextCards([])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <Topbar
        title="Current State"
        subtitle={undefined}
        action={refreshAction}
      />

      {data.mode === 'demo' && (
        <div
          className="mx-6 mt-3 px-4 py-2.5 rounded text-[11px] leading-relaxed"
          style={{ background: '#2d1f0a', border: '1px solid #92400e', color: '#fbbf24' }}
        >
          <strong>Demo mode</strong> — Using cached snapshot data (as of{' '}
          {data.as_of_ts ? new Date(data.as_of_ts).toLocaleDateString() : 'unknown'}). Live refresh unavailable.
        </div>
      )}

      <div className="px-6 py-5 space-y-6">

        {/* ── Block A: Regime Hero [NEW] ── */}
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <div
            style={{
              background: 'rgba(12,16,32,0.85)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid ${rColor}26`,
              borderRadius: 12,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 32px rgba(0,0,0,0.5)',
              padding: '24px 28px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{
              position: 'absolute', top: -80, left: -80,
              width: 300, height: 300,
              background: `radial-gradient(circle, ${rColor}1a 0%, transparent 70%)`,
              pointerEvents: 'none',
            }} />
            <div className="flex items-center gap-2 mb-3" style={{ position: 'relative', zIndex: 1 }}>
              <div className="live-dot" style={{ background: rColor }} />
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.12em', color: rColor, opacity: 0.85,
              }}>
                LIVE · {data.as_of_ts
                  ? new Date(data.as_of_ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—'}
              </span>
            </div>
            <div style={{
              fontSize: 52, fontWeight: 900, color: rColor, lineHeight: 1,
              marginBottom: 14, letterSpacing: '-0.02em', position: 'relative', zIndex: 1,
            }}>
              {data.regime}
            </div>
            <p style={{
              fontSize: 14, color: '#94a3b8', lineHeight: 1.65,
              maxWidth: 540, margin: 0, position: 'relative', zIndex: 1,
            }}>
              {narrative}
            </p>
          </div>
        </motion.div>

        {/* ── Block B: Secondary Metric Chips [NEW] ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'VIX Level', value: data.vix_level != null ? data.vix_level.toFixed(1) : '—', color: '#f1f5f9', subtitle: 'Market fear gauge' },
            {
              label: 'VIX Change',
              value: data.vix_chg_1d != null ? `${data.vix_chg_1d > 0 ? '+' : ''}${data.vix_chg_1d.toFixed(2)}` : '—',
              color: data.vix_chg_1d != null && data.vix_chg_1d > 0 ? colors.red : colors.green,
              subtitle: '1-day change',
            },
            { label: 'Trend', value: data.trend.replace('trend', ''), color: '#94a3b8', subtitle: 'Recent price direction' },
          ].map((chip, i) => (
            <motion.div key={chip.label} custom={i + 1} variants={cardVariants} initial="hidden" animate="visible">
              <div
                className="card-hover rounded-lg px-4 py-3"
                style={{ background: colors.surfaceElevated, border: `1px solid ${colors.borderElevated}` }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: colors.textDim, marginBottom: 4 }}>
                  {chip.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: chip.color, lineHeight: 1 }}>
                  {chip.value}
                </div>
                <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 3 }}>
                  {chip.subtitle}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Block C: Divider [KEEP — unchanged] ── */}
        <div className="h-px" style={{ background: '#151d2e' }} />

        <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <RiskTemperature data={riskTemperature} />
            <Panel title="What this means right now">
              <p className="text-[11px] leading-relaxed mb-4" style={{ color: '#94a3b8' }}>{narrative}</p>
              <div className="text-[9px] font-bold tracking-widest uppercase mb-2" style={{ color: '#4a6080' }}>
                Model confidence in each market state
              </div>
              <div className="flex flex-wrap gap-2">
                {(['calm', 'elevated', 'turbulent'] as const).map(r => {
                  const prob = (data as unknown as Record<string, unknown>)[`prob_${r}`] as number | null
                  if (prob == null) return null
                  return <RegimeBadge key={r} regime={r} probability={prob} />
                })}
              </div>
            </Panel>
          </div>
        </motion.div>

        <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible">
          <WhatChanged rows={whatChangedRows} />
        </motion.div>

        <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <StressLadder rows={stressLadderRows} />
            <div className="space-y-4">
              <MarketContextBrief cards={marketContextCards} />
              <Panel title="Model explanation">
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: '#94a3b8' }}>
                  Current State is focused on live market context. Open Signal Breakdown for model drivers, feature importance, historical analogs, and reliability details.
                </p>
                <Link
                  to="/model-drivers"
                  className="text-[11px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: '#38bdf8' }}
                >
                  Open Signal Breakdown for model explanation
                </Link>
              </Panel>
              <Panel title="Last 30 Trading Days">
                <MiniRegimeChart data={historicalPoints.slice(-30)} height={165} />
              </Panel>
            </div>
          </div>
        </motion.div>

      </div>
    </motion.div>
  )
}
