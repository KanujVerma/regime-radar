import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import DriverBar from '../components/ui/DriverBar'
import SkeletonBlock from '../components/ui/SkeletonBlock'
import Panel from '../components/ui/Panel'
import ReliabilityTable from '../components/ui/ReliabilityTable'
import ClosestHistoricalSetups from '../components/ClosestHistoricalSetups'
import { useModelDrivers } from '../hooks/useModelDrivers'
import { useCurrentState } from '../hooks/useCurrentState'
import { useAnalogs } from '../hooks/useAnalogs'
import { buildDriversNarrative, getDriverHeadline, formatRisk } from '../lib/narratives'
import { sentenceFor, labelFor } from '../lib/featureLabels'
import { colors, regimeColor, regimeGlow, regimeBorder, typography } from '../lib/tokens'
import ContributionChart from '../components/charts/ContributionChart'

const VOL_FEATURES = new Set([
  'rv_20d', 'rv_20d_pct', 'vix_level', 'vix_pct_504d',
  'vix_zscore_252d', 'vix_chg_5d', 'emv_level', 'emv_lag_20d',
])
const DRAWDOWN_FEATURES = new Set(['drawdown_pct_504d', 'drawdown'])
const STRESS_FEATURES = new Set(['turbulent_count_30d_lag1', 'days_in_regime_lag1'])
const TREND_FEATURES = new Set(['trend_code', 'momentum_20d', 'ret_20d', 'dist_sma50'])

function buildForwardBullets(topPushingFeature: string | undefined): string[] {
  const f = topPushingFeature ?? ''

  if (VOL_FEATURES.has(f)) {
    return [
      'Risk would likely rise if day-to-day volatility continues to climb',
      'The model would become more concerned if the pullback from recent highs deepens',
      'Risk would likely rise if high-stress days become more frequent over the next few weeks',
    ]
  }
  if (DRAWDOWN_FEATURES.has(f)) {
    return [
      'The model would become more concerned if the pullback from recent highs deepens',
      'Risk would likely rise if day-to-day volatility increases',
      'Risk would likely rise if high-stress days become more frequent over the next few weeks',
    ]
  }
  if (STRESS_FEATURES.has(f)) {
    return [
      'Risk would likely rise if high-stress days become more frequent over the next few weeks',
      'Risk would likely rise if day-to-day volatility continues to climb',
      'The model would become more concerned if the pullback from recent highs deepens',
    ]
  }
  if (TREND_FEATURES.has(f)) {
    return [
      'Risk would likely rise if recent price momentum continues to weaken',
      'Risk would likely rise if day-to-day volatility picks up',
      'The model would become more concerned if high-stress days start to accumulate',
    ]
  }
  // generic fallback
  return [
    'Risk would likely rise if market volatility continues to increase',
    'The model would become more concerned if the pullback from recent highs deepens',
    'Risk would likely rise if high-stress days become more frequent over the next few weeks',
  ]
}

export default function ModelDrivers() {
  const { data, loading, error } = useModelDrivers()
  const { data: stateData, loading: stateLoading, error: stateError } = useCurrentState()
  const { data: analogsData } = useAnalogs()
  const [reliabilityOpen, setReliabilityOpen] = useState(false)
  const [reliabilityHover, setReliabilityHover] = useState(false)

  if (loading || stateLoading) return (
    <div className="p-5 space-y-4">
      <SkeletonBlock height="120px" />
      <SkeletonBlock height="200px" />
      <SkeletonBlock height="80px" />
    </div>
  )
  if (error || stateError) return <div className="p-6 text-red-400 text-sm">{error ?? stateError}</div>
  if (!data) return null

  const regime = (stateData?.regime ?? 'unknown').toLowerCase()
  const risk = stateData?.transition_risk ?? 0
  const rColor = risk > 0.40 ? colors.red : risk > 0.20 ? colors.amber : colors.green
  const rRegimeColor = regimeColor[regime] ?? regimeColor['unknown']

  const localEntries = Object.entries(data.local_explanation)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  const pushing = localEntries.filter(([, v]) => v > 0).slice(0, 3)
  const holding = localEntries.filter(([, v]) => v < 0).slice(0, 3)

  const priorRegime =
    stateData?.delta?.regime_changed && stateData.delta.prior_regime
      ? stateData.delta.prior_regime
      : null

  const narrative = buildDriversNarrative(
    regime, risk,
    pushing.map(([f]) => f),
    holding.map(([f]) => f),
    priorRegime,
  )

  const topImportance = [...data.global_importance]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5)
  const maxImp = topImportance[0]?.importance ?? 0.001

  const forwardBullets = buildForwardBullets(pushing[0]?.[0])
  const [focusedDriver, setFocusedDriver] = useState<string | null>(null)

  const contributionData = Object.entries(data.local_explanation)
    .map(([feature, value]) => ({ label: labelFor(feature), value }))

  const demoAction = stateData?.mode === 'demo'
    ? <span className="text-[10px] px-2 py-1 rounded" style={{ background: '#2d1f0a', color: colors.amber, border: `1px solid ${colors.amberDim}` }}>Demo data</span>
    : undefined

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <Topbar title="Signal Breakdown" subtitle="What is driving today's risk reading?" action={demoAction} />

      <div className="p-5 space-y-4">

        {/* ── Hero ── */}
        <div style={{
          background: colors.glass,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${regimeBorder(rColor)}`,
          borderRadius: 12,
          boxShadow: `${colors.glassHighlight}, 0 4px 32px rgba(0,0,0,0.5)`,
          padding: '20px 24px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(ellipse 60% 60% at 80% 50%, ${regimeGlow[regime] ?? 'transparent'}, transparent)`,
          }} />
          <div style={{ position: 'relative', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...typography.microLabel, marginBottom: 6 }}>
                {stateData?.as_of_ts
                  ? new Date(stateData.as_of_ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                  : '—'} · Today's reading
              </div>
              <div style={{ color: colors.textPrimary, fontSize: 15, fontWeight: 800, lineHeight: 1.3, marginBottom: 10 }}>
                {getDriverHeadline(regime)}
              </div>
              <p style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 1.75, margin: 0 }}>
                {narrative}
              </p>
            </div>
            <div style={{ textAlign: 'center', minWidth: 72, flexShrink: 0 }}>
              <div style={{ ...typography.statMd, color: rColor, lineHeight: 1, marginBottom: 3 }}>
                {formatRisk(risk)}
              </div>
              <div style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', lineHeight: 1.4 }}>
                5-day<br />transition risk
              </div>
              <div style={{ fontSize: 10, color: colors.textDim, lineHeight: 1.4, marginTop: 2 }}>
                Chance conditions worsen<br />next 5 trading days
              </div>
              <div style={{
                display: 'inline-block', marginTop: 10, padding: '3px 8px', borderRadius: 99,
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                color: rRegimeColor,
                background: `${rRegimeColor}18`,
                border: `1px solid ${rRegimeColor}40`,
              }}>
                {stateData?.regime ?? '—'}
              </div>
            </div>
          </div>
        </div>

        {/* ── Two-column ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Left: push/pull bullets */}
          <Panel title="Why the model sees it this way today">
            {pushing.length === 0 && holding.length === 0 ? (
              <p style={{ color: colors.textMuted, fontSize: 10, lineHeight: 1.5 }}>
                Today's factor breakdown is unavailable — showing global importance instead.
              </p>
            ) : (
              <>
                {pushing.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: colors.red, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                      ↑ Pushing risk higher
                    </div>
                    {pushing.map(([feat]) => (
                      <div key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 4 }}>
                        <span style={{ color: colors.red, fontSize: 11, marginTop: 1, flexShrink: 0 }}>•</span>
                        <span style={{ color: colors.textSecondary, fontSize: 10, lineHeight: 1.55 }}>{sentenceFor(feat, 'up')}</span>
                      </div>
                    ))}
                  </div>
                )}
                {holding.length > 0 && (
                  <>
                    <div style={{ borderTop: `1px solid ${colors.border}`, margin: '0 0 8px' }} />
                    <div style={{ color: colors.green, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                      ↓ Holding risk in check
                    </div>
                    {holding.map(([feat]) => (
                      <div key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 4 }}>
                        <span style={{ color: colors.green, fontSize: 11, marginTop: 1, flexShrink: 0 }}>•</span>
                        <span style={{ color: colors.textSecondary, fontSize: 10, lineHeight: 1.55 }}>{sentenceFor(feat, 'down')}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </Panel>

          {/* Right: global importance bars */}
          <Panel title="What always drives the model most">
            <p style={{ color: colors.textDim, fontSize: 10, marginBottom: 10, lineHeight: 1.5 }}>
              Relative importance across all historical periods — top 5 factors shown. Bars are proportional to each other, not a percentage breakdown.
            </p>
            {topImportance.map((d, i) => (
              <div
                key={d.feature}
                onMouseEnter={() => setFocusedDriver(labelFor(d.feature))}
                onMouseLeave={() => setFocusedDriver(null)}
              >
                <DriverBar
                  label={labelFor(d.feature)}
                  value={d.importance}
                  max={maxImp}
                  direction="raising"
                  delay={i * 40}
                  focused={focusedDriver === labelFor(d.feature)}
                  dimmed={focusedDriver !== null && focusedDriver !== labelFor(d.feature)}
                />
              </div>
            ))}
            <p style={{ color: colors.textDim, fontSize: 10, marginTop: 10, lineHeight: 1.5 }}>
              Left panel shows <em>what is driving the model today</em>. This panel shows <em>what the model typically relies on most</em>.
            </p>
          </Panel>
        </div>

        {/* ── Contribution chart ── */}
        {contributionData.length > 0 && (
          <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, paddingBottom: 4 }}>
            <div style={{ padding: '10px 16px 6px', borderBottom: `1px solid ${colors.border}`, marginBottom: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' as const, color: colors.textMuted }}>
                What's driving the signal today
              </span>
            </div>
            <ContributionChart
              data={contributionData}
              onHover={setFocusedDriver}
            />
          </div>
        )}

        {/* ── Forward-looking block ── */}
        <Panel title="What would raise risk further">
          {forwardBullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
              <span style={{ color: '#a78bfa', flexShrink: 0, fontWeight: 700, fontSize: 10, lineHeight: 1.55, marginTop: 1 }}>→</span>
              <span style={{ color: '#c4b5fd', fontSize: 10, lineHeight: 1.55 }}>{b}</span>
            </div>
          ))}
        </Panel>

        {/* ── Closest Historical Setups ── */}
        {analogsData && analogsData.analogs.length > 0 && (
          <ClosestHistoricalSetups data={analogsData} />
        )}

        {/* ── Reliability accordion ── */}
        {data.threshold_sweep.length > 0 && (
          <div>
            <button
              onClick={() => setReliabilityOpen(o => !o)}
              onMouseEnter={() => setReliabilityHover(true)}
              onMouseLeave={() => setReliabilityHover(false)}
              aria-expanded={reliabilityOpen}
              className="w-full text-left"
              style={{
                background: reliabilityOpen ? colors.surface : reliabilityHover ? colors.surfaceElevated : colors.bg,
                border: `1px solid ${colors.borderElevated}`,
                borderRadius: reliabilityOpen ? '6px 6px 0 0' : 6,
                padding: '10px 14px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <div>
                <div style={{ color: reliabilityHover ? colors.textPrimary : colors.textSecondary, fontSize: 10, fontWeight: 600, transition: 'color 0.15s' }}>
                  Model reliability and threshold tradeoffs
                </div>
                <div style={{ color: reliabilityHover ? colors.textMuted : colors.textDim, fontSize: 10, marginTop: 2, transition: 'color 0.15s' }}>
                  How often does flagging at different risk levels catch regime shifts?
                </div>
              </div>
              <motion.span
                animate={{ rotate: reliabilityOpen ? 90 : 0 }}
                transition={{ duration: 0.15 }}
                style={{ display: 'inline-block', color: reliabilityHover ? colors.textSecondary : colors.textMuted, fontSize: 14, flexShrink: 0 }}
              >
                ▸
              </motion.span>
            </button>
            <AnimatePresence>
              {reliabilityOpen && (
                <motion.div
                  key="reliability-table"
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <ReliabilityTable rows={data.threshold_sweep} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

      </div>
    </motion.div>
  )
}
