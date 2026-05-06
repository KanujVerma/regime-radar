import { useState, useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import ProbabilityTripod from '../components/charts/ProbabilityTripod'
import { useScenario } from '../hooks/useScenario'
import { SLIDER_CONFIG, PRESETS, type ScenarioInputs } from '../lib/sliderConfig'
import { DEFAULT_THRESHOLD } from '../lib/constants'
import { useModelDrivers } from '../hooks/useModelDrivers'
import { buildScenarioVerdict, detectScenarioCharacter } from '../lib/narratives'
import {
  selectDriverCards,
  getChangedInputPills,
} from '../lib/scenarioDriverCards'

const DEFAULT_INPUTS: ScenarioInputs = {
  vix_level: 18, vix_chg_5d: 0, rv_20d_pct: 0.40,
  drawdown_pct_504d: 0.05, ret_20d: 0.01, dist_sma50: 0.01,
}

const STANDARD_PRESETS = [
  { id: 'calm_recovery',      icon: '🌤', label: 'Calm Recovery',      desc: 'Low vol, long calm streak' },
  { id: 'volatility_pickup',  icon: '📈', label: 'Volatility Pickup',  desc: 'VIX rising, still near highs' },
  { id: 'growth_scare',       icon: '📉', label: 'Growth Scare',       desc: 'Moderate selloff, vol elevated' },
  { id: 'panic_shock',        icon: '⚡', label: 'Panic Shock',        desc: 'Sharp VIX spike, early crisis signal' },
  { id: 'slow_deterioration', icon: '🐌', label: 'Slow Deterioration', desc: 'Grinding lower, no single spike' },
]

const CRISIS_PRESET = {
  id: 'crisis_peak', icon: '🔴', label: 'Crisis Peak',
  desc: 'Already 2 weeks into sustained turbulence',
}

const DRIVER_INTERP: Record<string, { raisesRisk: string; lowersRisk: string }> = {
  drawdown_pct_504d: {
    raisesRisk: 'Deepening drawdown is the primary stress signal the model is responding to.',
    lowersRisk: 'Drawdown remains contained — limiting how much stress can build.',
  },
  vix_level: {
    raisesRisk: 'Fear gauge rising — adds to the stress reading.',
    lowersRisk: 'VIX is low — suppressing the stress reading.',
  },
  vix_chg_5d: {
    raisesRisk: 'Fear is accelerating over the past week — adds momentum to the stress signal.',
    lowersRisk: 'Fear has been receding — partially offsetting other stress inputs.',
  },
  rv_20d_pct: {
    raisesRisk: 'Realized volatility is elevated relative to recent history — amplifying the regime signal.',
    lowersRisk: 'Volatility is below recent norms — a calming factor.',
  },
  ret_20d: {
    raisesRisk: 'Recent returns are weak — reinforcing the stress reading.',
    lowersRisk: 'Medium-term momentum is holding — limiting how much the stress reading can rise.',
  },
  dist_sma50: {
    raisesRisk: 'Price is stretched below its 50-day average — adding to the stress signal.',
    lowersRisk: 'Price remains above its 50-day average — a stabilizing factor.',
  },
  turbulent_count_30d_lag1: {
    raisesRisk: 'Stress has been persistent recently — the market has had more high-pressure days than usual over the past month, and that sustained pattern adds weight to the current reading.',
    lowersRisk: 'The recent past has been relatively quiet — few high-stress days in the last month, which offsets some of the current pressure.',
  },
  days_in_regime_lag1: {
    raisesRisk: 'The current conditions have been running for a while — sustained regimes tend to reinforce themselves, which deepens the model\'s conviction.',
    lowersRisk: 'These are relatively new conditions — the regime hasn\'t had time to entrench, which keeps the model\'s reading more tentative.',
  },
}

const SLIDER_KEYS_FOR_SENSITIVITY = [
  'vix_level', 'vix_chg_5d', 'rv_20d_pct', 'drawdown_pct_504d', 'ret_20d', 'dist_sma50',
] as const

const SENSITIVITY_COLORS = { high: '#f87171', medium: '#fbbf24', low: '#475569' } as const

const PERCENTILE_KEYS = new Set(['rv_20d_pct', 'drawdown_pct_504d'])

function notNull<T>(v: T | null | undefined): v is T { return v != null }

function getSliderSensitivity(
  key: string,
  globalImportance: { feature: string; importance: number }[] | undefined,
): 'high' | 'medium' | 'low' {
  if (!globalImportance) return 'low'
  const ranked = [...globalImportance]
    .filter(d => (SLIDER_KEYS_FOR_SENSITIVITY as readonly string[]).includes(d.feature))
    .sort((a, b) => b.importance - a.importance)
  const idx = ranked.findIndex(d => d.feature === key)
  if (idx === -1) return 'low'
  if (idx <= 1)   return 'high'
  if (idx <= 3)   return 'medium'
  return 'low'
}

function sliderColor(cfg: (typeof SLIDER_CONFIG)[0], val: number): string {
  if (val <= cfg.calmMax) return '#06b6d4'
  if (val >= cfg.stressMin) return '#f87171'
  return '#fbbf24'
}

function formatDriverVal(feature: string, val: number): string {
  return PERCENTILE_KEYS.has(feature)
    ? `${(val * 100).toFixed(0)}%`
    : val.toFixed(1)
}

export default function ScenarioExplorer() {
  const [inputs, setInputs] = useState<ScenarioInputs>(DEFAULT_INPUTS)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const { data, loading, error } = useScenario(inputs)
  const { data: modelData } = useModelDrivers()

  const [currentMarketInputs, setCurrentMarketInputs] = useState<ScenarioInputs | null>(null)
  const seededRef = useRef(false)
  useEffect(() => {
    if (data?.baseline_inputs && !seededRef.current) {
      seededRef.current = true
      const marketInputs = { ...DEFAULT_INPUTS, ...data.baseline_inputs } as ScenarioInputs
      setCurrentMarketInputs(marketInputs)
      setInputs(marketInputs)
    }
  }, [data])

  const reset = useCallback(
    () => setInputs(currentMarketInputs ?? DEFAULT_INPUTS),
    [currentMarketInputs],
  )

  const sweepRow = modelData?.threshold_sweep?.find(r => Math.abs(r.threshold - threshold) < 0.05)

  const scenarioStress = data ? 1 - data.prob_calm : null
  const baselineStress = data ? 1 - data.baseline_prob_calm : null
  const thresholdGap = scenarioStress != null ? scenarioStress - threshold : null

  const character = detectScenarioCharacter(inputs)
  const verdict = data
    ? buildScenarioVerdict(
        data.prob_calm,
        data.prob_elevated,
        data.prob_turbulent,
        data.driver_deltas[0]?.plain_label ?? '',
        character,
      )
    : null

  const dominant = data
    ? (data.prob_calm >= data.prob_elevated && data.prob_calm >= data.prob_turbulent
        ? 'Calm'
        : data.prob_elevated >= data.prob_turbulent
        ? 'Elevated'
        : 'Turbulent')
    : null

  const dominantProb = data
    ? (dominant === 'Calm' ? data.prob_calm : dominant === 'Turbulent' ? data.prob_turbulent : data.prob_elevated)
    : null

  const { primary, secondary, offset } = selectDriverCards(data?.driver_deltas ?? [])
  const isActive = primary !== null
  const changedPills = data
    ? getChangedInputPills(inputs, data.baseline_inputs, SLIDER_CONFIG)
    : []

  const resetBtn = (
    <button
      onClick={reset}
      className="text-[10px] font-bold px-3 py-1.5 rounded"
      style={{ background: '#0c1020', border: '1px solid #151d2e', color: '#64748b' }}
    >
      ↺ Reset to current market
    </button>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar title="Scenario Explorer" action={resetBtn} />
      <div className="p-5 flex gap-5">

        {/* ── Left column ── */}
        <div className="shrink-0 space-y-4" style={{ width: 276 }}>

          {/* Presets */}
          <Panel title="Quick scenarios">
            <div className="flex flex-col gap-2">
              {STANDARD_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setInputs(PRESETS[p.id])}
                  className="text-left px-3 py-2 rounded-lg w-full"
                  style={{ background: '#080b12', border: '1px solid #151d2e' }}
                >
                  <div className="text-[11px] font-semibold" style={{ color: '#94a3b8' }}>
                    {p.icon} {p.label}
                  </div>
                  <div className="text-[9px] mt-0.5" style={{ color: '#475569' }}>{p.desc}</div>
                </button>
              ))}

              <div style={{ height: 1, background: '#1a0a0a', margin: '2px 0' }} />
              <div
                className="text-[7px] font-bold tracking-widest uppercase"
                style={{ color: '#5a2020' }}
              >
                Sustained Crisis
              </div>

              <button
                onClick={() => setInputs(PRESETS[CRISIS_PRESET.id])}
                className="text-left py-2 rounded-lg w-full"
                style={{
                  background: '#0e0505',
                  border: '1px solid #7f1d1d',
                  borderLeft: '3px solid #f87171',
                  paddingLeft: 10,
                  paddingRight: 12,
                }}
              >
                <div className="text-[11px] font-semibold" style={{ color: '#fca5a5' }}>
                  {CRISIS_PRESET.icon} {CRISIS_PRESET.label}
                </div>
                <div className="text-[9px] mt-0.5" style={{ color: '#6b3030' }}>{CRISIS_PRESET.desc}</div>
              </button>
            </div>
          </Panel>

          <div className="h-px" style={{ background: '#151d2e' }} />

          {/* Sensitivity legend */}
          <div className="flex items-center gap-3">
            <span className="text-[8px] font-bold tracking-widest uppercase" style={{ color: '#4a6080' }}>
              Model weight
            </span>
            {(['high', 'medium', 'low'] as const).map(s => (
              <span key={s} className="flex items-center gap-1 text-[8px]" style={{ color: '#475569' }}>
                <span
                  style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: SENSITIVITY_COLORS[s], display: 'inline-block',
                  }}
                />
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            ))}
          </div>

          {/* Sliders */}
          <div className="space-y-4">
            {SLIDER_CONFIG.map(cfg => {
              const val = inputs[cfg.key]
              const color = sliderColor(cfg, val)
              const sensitivity = getSliderSensitivity(cfg.key, modelData?.global_importance)
              return (
                <div key={cfg.key}>
                  <div className="flex justify-between mb-1 items-center">
                    <span
                      className="text-[10px] font-semibold flex items-center gap-1.5"
                      style={{ color: '#94a3b8' }}
                    >
                      <span
                        style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: SENSITIVITY_COLORS[sensitivity],
                          display: 'inline-block', flexShrink: 0,
                        }}
                      />
                      {cfg.label}
                    </span>
                    <span className="text-[10px] font-bold" style={{ color }}>
                      {val.toFixed(cfg.step < 0.1 ? 2 : 1)}
                    </span>
                  </div>
                  <p className="text-[9px] mb-1.5" style={{ color: '#94a3b8' }}>{cfg.helper}</p>
                  <input
                    type="range"
                    min={cfg.min}
                    max={cfg.max}
                    step={cfg.step}
                    value={val}
                    onChange={e => setInputs(prev => ({ ...prev, [cfg.key]: parseFloat(e.target.value) }))}
                    className="w-full cursor-pointer"
                    style={{ accentColor: color }}
                  />
                </div>
              )
            })}
          </div>

          <div className="h-px" style={{ background: '#151d2e' }} />

          {/* Threshold section */}
          <div>
            <div
              className="text-[9px] font-bold tracking-widest uppercase mb-2"
              style={{ color: '#4a6080' }}
            >
              Alert threshold
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-[10px]" style={{ color: '#94a3b8' }}>Threshold</span>
              <span className="text-[10px] font-bold" style={{ color: '#fbbf24' }}>
                {(threshold * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range" min={0.10} max={0.70} step={0.10}
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-full cursor-pointer mb-3"
              style={{ accentColor: '#fbbf24' }}
            />

            {/* Alert connection block */}
            {data && thresholdGap != null && (
              <div
                className="rounded-lg px-3 py-2 mb-3"
                style={thresholdGap < 0
                  ? { background: '#0f2a1a', border: '1px solid #14532d' }
                  : { background: '#1a0505', border: '1px solid #7f1d1d' }}
              >
                <div
                  className="text-[10px] font-semibold"
                  style={{ color: thresholdGap < 0 ? '#4ade80' : '#f87171' }}
                >
                  {thresholdGap < 0
                    ? '✓ This scenario stays below your alert threshold'
                    : '⚠ This scenario would cross your alert threshold'}
                </div>
                <div className="text-[9px] mt-1" style={{ color: '#475569' }}>
                  {thresholdGap < 0
                    ? `Stress probability ${(scenarioStress! * 100).toFixed(0)}% — ${Math.abs(thresholdGap * 100).toFixed(0)}pp below the ${(threshold * 100).toFixed(0)}% threshold`
                    : `Stress probability ${(scenarioStress! * 100).toFixed(0)}% exceeds the ${(threshold * 100).toFixed(0)}% threshold by ${(thresholdGap * 100).toFixed(0)}pp`}
                </div>
              </div>
            )}

            {sweepRow ? (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Crises caught', value: `${(sweepRow.recall * 100).toFixed(0)}%` },
                  { label: 'False alarms',  value: `${(sweepRow.false_alert_rate * 100).toFixed(0)}%` },
                  { label: 'Avg warning',   value: `${sweepRow.avg_lead_time_days.toFixed(0)}d` },
                ].map(m => (
                  <div
                    key={m.label}
                    className="rounded-lg p-2 text-center"
                    style={{ background: '#080b12', border: '1px solid #151d2e' }}
                  >
                    <div className="text-[8px] tracking-wide uppercase" style={{ color: '#4a6080' }}>{m.label}</div>
                    <div className="text-[14px] font-extrabold" style={{ color: '#94a3b8' }}>{m.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[9px]" style={{ color: '#94a3b8' }}>Threshold data unavailable</p>
            )}
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="flex-1 space-y-4">
          {loading && <div className="text-slate-500 text-sm">Calculating…</div>}
          {error && <div className="text-red-400 text-sm">{error}</div>}

          {data && verdict && (
            <>
              {/* Verdict block */}
              <div
                className="rounded-xl p-4"
                style={{ border: '1px solid #1a3a5f', background: '#080d18' }}
              >
                {/* Badge + dominant label */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                    style={{
                      background: verdict.badgeBg,
                      border: `1px solid ${verdict.badgeBorder}`,
                      color: verdict.badgeColor,
                    }}
                  >
                    {verdict.badgeLabel}
                  </span>
                  {dominant && (
                    <span className="text-[9px] font-semibold" style={{ color: '#4a6080' }}>
                      · {dominant} dominant
                    </span>
                  )}
                </div>

                {/* Verdict sentence */}
                <p
                  className="text-[11px] leading-relaxed mb-2"
                  style={{ color: '#94a3b8' }}
                >
                  {verdict.sentence}
                </p>

                {/* Labeler-vs-model context — shown when turbulent is present but not dominant */}
                {data.prob_turbulent >= 0.01 && data.prob_turbulent < 0.50 && (
                  <p
                    className="text-[9px] leading-relaxed mb-2"
                    style={{ color: '#4a6080' }}
                  >
                    The model weighs regime persistence — turbulent becomes dominant only after stress accumulates over multiple days, not from a single shock.
                  </p>
                )}

                {/* Secondary stats */}
                <div className="flex items-center gap-4 mb-2">
                  {dominant && dominantProb != null && (
                    <span className="text-[9px]" style={{ color: '#64748b' }}>
                      {dominant}:{' '}
                      <span className="font-semibold">
                        {(dominantProb * 100).toFixed(0)}%
                      </span>
                    </span>
                  )}
                  {baselineStress != null && (
                    <span className="text-[9px]" style={{ color: '#64748b' }}>
                      Δ{' '}
                      {(1 - data.prob_calm - baselineStress) >= 0 ? '+' : ''}
                      {((1 - data.prob_calm - baselineStress) * 100).toFixed(0)}pp vs current
                    </span>
                  )}
                </div>

                {/* Alert pill */}
                {thresholdGap != null && (
                  <span
                    className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                    style={thresholdGap < 0
                      ? { background: '#0f2a1a', color: '#4ade80' }
                      : { background: '#1a0505', color: '#f87171' }}
                  >
                    {thresholdGap < 0 ? '✓ Below alert threshold' : '⚠ Alert threshold crossed'}
                  </span>
                )}
              </div>

              {/* Probability Tripod */}
              <Panel title="Regime probability — current market → your scenario">
                <ProbabilityTripod
                  baselineCalm={data.baseline_prob_calm}
                  baselineElevated={data.baseline_prob_elevated}
                  baselineTurbulent={data.baseline_prob_turbulent}
                  scenarioCalm={data.prob_calm}
                  scenarioElevated={data.prob_elevated}
                  scenarioTurbulent={data.prob_turbulent}
                />
              </Panel>

              {/* Driver explanation */}
              <Panel title="What's driving this scenario">
                {data === null ? (
                  /* Loading state — data not yet resolved */
                  <div style={{
                    textAlign: 'center', padding: '24px 0',
                    fontSize: 10, color: '#334155', letterSpacing: '0.05em',
                  }}>
                    Loading scenario drivers…
                  </div>
                ) : !isActive ? (
                  /* Empty state — data resolved, no driver meets threshold */
                  <div style={{
                    border: '1.5px dashed #1e2a3a',
                    borderRadius: 8,
                    padding: '28px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    textAlign: 'center',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: '#0d1526', border: '1px solid #1e2a3a',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, color: '#334155',
                    }}>
                      ⇄
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                      No strong driver signal yet
                    </div>
                    <div style={{ fontSize: 10, color: '#334155', maxWidth: 220, lineHeight: 1.6 }}>
                      Adjust a slider or select a preset to see what starts driving the scenario away from the current market.
                    </div>
                  </div>
                ) : (
                  /* Active state */
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {([primary, secondary] as const).filter(notNull).map((card) => {
                        const raisesRisk = card.delta_value > 0
                        const interp = DRIVER_INTERP[card.feature]
                        const interpText = interp
                          ? (raisesRisk ? interp.raisesRisk : interp.lowersRisk)
                          : `This input is shifted in the scenario, contributing to the difference — but interpretation text isn't available for this specific signal yet.`
                        return (
                          <div key={card.feature} style={{
                            background: '#0d1526',
                            border: '1px solid #1e2a3a',
                            borderRadius: 7, padding: '9px 11px',
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                          }}>
                            <div style={{
                              fontSize: 18, lineHeight: 1, marginTop: 1,
                              flexShrink: 0, color: raisesRisk ? '#f87171' : '#4ade80',
                            }}>
                              {raisesRisk ? '↑' : '↓'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0' }}>
                                {card.plain_label}
                              </div>
                              <div style={{
                                fontSize: 9, marginTop: 2, color: '#475569',
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}>
                                <span style={{ color: '#64748b' }}>
                                  {formatDriverVal(card.feature, data!.baseline_inputs[card.feature] ?? 0)}
                                </span>
                                <span>→</span>
                                <span style={{ color: raisesRisk ? '#f87171' : '#4ade80' }}>
                                  {/* falls back to 0 if feature is not a slider key — display-only, backend should match */}
                                  {formatDriverVal(card.feature, inputs[card.feature as keyof typeof inputs] ?? 0)}
                                </span>
                              </div>
                              <div style={{
                                fontSize: 9, marginTop: 4, color: '#64748b',
                                fontStyle: 'italic', lineHeight: 1.5,
                              }}>
                                {interpText}
                              </div>
                            </div>
                            <div style={{
                              fontSize: 8, fontWeight: 800, letterSpacing: '0.05em',
                              padding: '2px 7px', borderRadius: 10, flexShrink: 0,
                              marginTop: 1, whiteSpace: 'nowrap',
                              background: raisesRisk ? '#3d1515' : '#0a2212',
                              color: raisesRisk ? '#f87171' : '#4ade80',
                            }}>
                              {raisesRisk ? 'RAISES RISK' : 'LOWERS RISK'}
                            </div>
                          </div>
                        )
                      })}

                      {offset && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 1, background: '#151d2e' }} />
                            <span style={{
                              fontSize: 8, color: '#1e2a3a',
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                            }}>
                              partial offset
                            </span>
                            <div style={{ flex: 1, height: 1, background: '#151d2e' }} />
                          </div>
                          {/*
                            Offset card: arrow + badge both use sign-appropriate color.
                            Badge text is always "OFFSETS" — role is the same whether primary
                            is stress-raising or stress-lowering.
                          */}
                          <div style={{
                            background: '#070e1a', border: '1px solid #132218',
                            borderRadius: 7, padding: '9px 11px',
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                          }}>
                            {(() => {
                              const offsetRaises = offset.delta_value > 0
                              const offsetColor = offsetRaises ? '#f87171' : '#4ade80'
                              const interpEntry = DRIVER_INTERP[offset.feature]
                              const interpText = interpEntry
                                ? (offsetRaises ? interpEntry.raisesRisk : interpEntry.lowersRisk)
                                : `This input is shifted in the scenario, contributing to the difference — but interpretation text isn't available for this specific signal yet.`
                              return (
                                <>
                                  <div style={{
                                    fontSize: 18, lineHeight: 1, marginTop: 1,
                                    flexShrink: 0, color: offsetColor,
                                  }}>
                                    {offsetRaises ? '↑' : '↓'}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0' }}>
                                      {offset.plain_label}
                                    </div>
                                    <div style={{
                                      fontSize: 9, marginTop: 2, color: '#475569',
                                      display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                      <span style={{ color: '#64748b' }}>
                                        {formatDriverVal(offset.feature, data!.baseline_inputs[offset.feature] ?? 0)}
                                      </span>
                                      <span>→</span>
                                      <span style={{ color: offsetColor }}>
                                        {/* falls back to 0 if feature is not a slider key — display-only, backend should match */}
                                        {formatDriverVal(offset.feature, inputs[offset.feature as keyof typeof inputs] ?? 0)}
                                      </span>
                                    </div>
                                    <div style={{
                                      fontSize: 9, marginTop: 4, color: '#64748b',
                                      fontStyle: 'italic', lineHeight: 1.5,
                                    }}>
                                      {interpText}
                                    </div>
                                  </div>
                                  <div style={{
                                    fontSize: 8, fontWeight: 800, letterSpacing: '0.05em',
                                    padding: '2px 7px', borderRadius: 10, flexShrink: 0,
                                    marginTop: 1, whiteSpace: 'nowrap',
                                    background: offsetRaises ? '#3d1515' : '#0a2212',
                                    color: offsetColor,
                                  }}>
                                    OFFSETS
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        </>
                      )}
                    </div>

                    {changedPills.length > 0 && (
                      <div style={{
                        marginTop: 10, paddingTop: 10, borderTop: '1px solid #0d1526',
                        display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
                      }}>
                        <span style={{
                          fontSize: 8, color: '#334155', fontWeight: 600,
                          textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 2,
                        }}>
                          Changed:
                        </span>
                        {changedPills.map(pill => (
                          <span key={pill.key} style={{
                            fontSize: 9, padding: '2px 8px', borderRadius: 10,
                            background: '#0d1526', border: '1px solid #1e2a3a',
                            color: '#64748b', display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            {pill.label}
                            {' '}
                            <span style={{ color: pill.delta > 0 ? '#f87171' : '#4ade80' }}>
                              {pill.delta > 0 ? '↑' : '↓'}{' '}
                              {formatDriverVal(pill.key, Math.abs(pill.delta))}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>

      </div>
    </motion.div>
  )
}
