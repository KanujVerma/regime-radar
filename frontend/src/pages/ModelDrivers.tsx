import { useState } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import DriverBar from '../components/ui/DriverBar'
import { useModelDrivers } from '../hooks/useModelDrivers'
import { useCurrentState } from '../hooks/useCurrentState'
import { buildDriversNarrative, getDriverHeadline, formatRisk } from '../lib/narratives'
import { sentenceFor } from '../lib/featureLabels'
import { regimeColor } from '../lib/tokens'
import type { ThresholdSweepRow } from '../types/api'

const VOL_FEATURES = new Set([
  'rv_20d', 'rv_20d_pct', 'vix_level', 'vix_pct_504d',
  'vix_zscore_252d', 'vix_chg_5d', 'emv_level',
])
const DRAWDOWN_FEATURES = new Set(['drawdown_pct_504d'])
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
  const { data: stateData, loading: stateLoading } = useCurrentState()
  const [reliabilityOpen, setReliabilityOpen] = useState(false)

  if (loading || stateLoading) return <div className="p-6 text-slate-500 text-sm">Loading…</div>
  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>
  if (!data) return null

  const regime = (stateData?.regime ?? 'unknown').toLowerCase()
  const risk = stateData?.transition_risk ?? 0
  const rColor = risk > 0.40 ? '#f87171' : risk > 0.20 ? '#fbbf24' : '#4ade80'
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

  const demoAction = stateData?.mode === 'demo'
    ? <span className="text-[10px] px-2 py-1 rounded" style={{ background: '#2d1f0a', color: '#fbbf24', border: '1px solid #92400e' }}>Demo data</span>
    : undefined

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar title="Model Drivers" subtitle="What is driving today's risk reading?" action={demoAction} />

      <div className="p-5 space-y-4">

        {/* ── Hero ── */}
        <div style={{ background: '#0c1520', border: '1px solid #1e3a5f', borderRadius: 8, padding: '16px 18px', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
              {stateData?.as_of_ts
                ? new Date(stateData.as_of_ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : '—'} · Today's reading
            </div>
            <div style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 800, lineHeight: 1.3, marginBottom: 10 }}>
              {getDriverHeadline(regime)}
            </div>
            <p style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.75, margin: 0 }}>
              {narrative}
            </p>
          </div>
          <div style={{ textAlign: 'center', minWidth: 72, flexShrink: 0 }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: rColor, lineHeight: 1, marginBottom: 3 }}>
              {formatRisk(risk)}
            </div>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', lineHeight: 1.4 }}>
              Weekly<br />transition risk
            </div>
            <div style={{ fontSize: 8.5, color: '#4a5568', lineHeight: 1.4, marginTop: 2 }}>
              Chance conditions<br />worsen this week
            </div>
            <div style={{
              display: 'inline-block', marginTop: 10, padding: '3px 8px', borderRadius: 99,
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              color: rRegimeColor,
              background: `${rRegimeColor}18`,
              border: `1px solid ${rRegimeColor}40`,
            }}>
              {stateData?.regime ?? '—'}
            </div>
          </div>
        </div>

        {/* ── Two-column ── */}
        <div className="grid grid-cols-2 gap-3">

          {/* Left: push/pull bullets */}
          <div style={{ background: '#080b12', border: '1px solid #151d2e', borderRadius: 6, padding: '12px 14px' }}>
            <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
              Why the model sees it this way today
            </div>
            {pushing.length === 0 && holding.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: 10, lineHeight: 1.5 }}>
                Today's factor breakdown is unavailable — showing global importance instead.
              </p>
            ) : (
              <>
                {pushing.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: '#f87171', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                      ↑ Pushing risk higher
                    </div>
                    {pushing.map(([feat]) => (
                      <div key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 4 }}>
                        <span style={{ color: '#f87171', fontSize: 11, marginTop: 1, flexShrink: 0 }}>•</span>
                        <span style={{ color: '#cbd5e1', fontSize: 10, lineHeight: 1.55 }}>{sentenceFor(feat, 'up')}</span>
                      </div>
                    ))}
                  </div>
                )}
                {holding.length > 0 && (
                  <>
                    <div style={{ borderTop: '1px solid #151d2e', margin: '0 0 8px' }} />
                    <div style={{ color: '#4ade80', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                      ↓ Holding risk in check
                    </div>
                    {holding.map(([feat]) => (
                      <div key={feat} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 4 }}>
                        <span style={{ color: '#4ade80', fontSize: 11, marginTop: 1, flexShrink: 0 }}>•</span>
                        <span style={{ color: '#cbd5e1', fontSize: 10, lineHeight: 1.55 }}>{sentenceFor(feat, 'down')}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {/* Right: global importance bars */}
          <div style={{ background: '#080b12', border: '1px solid #151d2e', borderRadius: 6, padding: '12px 14px' }}>
            <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
              What always drives the model most
            </div>
            <p style={{ color: '#4a5568', fontSize: 9, marginBottom: 10, lineHeight: 1.5 }}>
              Average influence across all historical periods — not just today.
            </p>
            {topImportance.map(d => (
              <DriverBar key={d.feature} feature={d.feature} importance={d.importance} maxImportance={maxImp} positive labelWidth={120} />
            ))}
            <p style={{ color: '#4a5568', fontSize: 9, marginTop: 10, lineHeight: 1.5 }}>
              Left panel shows <em>what is happening today</em>. This panel shows <em>what the model generally relies on most</em>.
            </p>
          </div>
        </div>

        {/* ── Forward-looking block ── */}
        <div style={{ background: '#0d0b18', border: '1px solid #2e1d48', borderRadius: 6, padding: '12px 14px' }}>
          <div style={{ color: '#a78bfa', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
            What would raise risk further
          </div>
          {forwardBullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
              <span style={{ color: '#a78bfa', flexShrink: 0, fontWeight: 700 }}>→</span>
              <span style={{ color: '#c4b5fd', fontSize: 10, lineHeight: 1.55 }}>{b}</span>
            </div>
          ))}
        </div>

        {/* ── Reliability accordion ── */}
        {data.threshold_sweep.length > 0 && (
          <div>
            <button
              onClick={() => setReliabilityOpen(o => !o)}
              className="w-full text-left"
              style={{
                background: '#080b12',
                border: '1px solid #151d2e',
                borderRadius: reliabilityOpen ? '6px 6px 0 0' : 6,
                padding: '9px 14px',
                cursor: 'pointer',
              }}
            >
              <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600 }}>
                {reliabilityOpen ? '▾' : '▸'} Model reliability and threshold tradeoffs
              </div>
              <div style={{ color: '#4a5568', fontSize: 9, marginTop: 2 }}>
                How often does flagging at different risk levels actually catch regime shifts?
              </div>
            </button>
            {reliabilityOpen && <ReliabilityTable rows={data.threshold_sweep} />}
          </div>
        )}

      </div>
    </motion.div>
  )
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—'
  return `${(v * 100).toFixed(0)}%`
}

function fmtDays(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—'
  return `${v.toFixed(0)} days`
}

function ReliabilityTable({ rows }: { rows: ThresholdSweepRow[] }) {
  return (
    <div style={{ background: '#080b12', border: '1px solid #151d2e', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '12px 14px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Alert threshold', 'Shifts caught', 'Avg. days early', 'False alarm rate'].map(h => (
              <th key={h} style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase', fontWeight: 600, textAlign: 'left', paddingBottom: 8, paddingRight: 8, borderBottom: '1px solid #151d2e' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.threshold}>
              <td style={{ color: '#f1f5f9', fontSize: 10, padding: '5px 8px 5px 0', borderBottom: '1px solid #0f1929' }}>
                {fmtPct(row.threshold)}
              </td>
              <td style={{ color: '#94a3b8', fontSize: 10, padding: '5px 8px 5px 0', borderBottom: '1px solid #0f1929' }}>
                {fmtPct(row.recall)}
              </td>
              <td style={{ color: '#94a3b8', fontSize: 10, padding: '5px 8px 5px 0', borderBottom: '1px solid #0f1929' }}>
                {fmtDays(row.avg_lead_time_days)}
              </td>
              <td style={{ color: '#94a3b8', fontSize: 10, padding: '5px 8px 5px 0', borderBottom: '1px solid #0f1929' }}>
                {fmtPct(row.false_alert_rate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: '#4a5568', fontSize: 9, marginTop: 10, lineHeight: 1.6 }}>
        <strong style={{ color: '#94a3b8' }}>How to read this:</strong> At a lower threshold, the model catches more regime shifts but also produces more false alarms. At a higher threshold, it is more selective — when it flags, it tends to be meaningful. The model is not designed to time market exits; it identifies when conditions are becoming stress-prone.
      </p>
    </div>
  )
}
