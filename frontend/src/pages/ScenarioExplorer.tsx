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

const DEFAULT_INPUTS: ScenarioInputs = {
  vix_level: 18, vix_chg_5d: 0, rv_20d_pct: 0.40,
  drawdown_pct_504d: 0.05, ret_20d: 0.01, dist_sma50: 0.01,
}

const PRESET_BUTTONS = [
  { id: 'calm_recovery',      icon: '🌤', label: 'Calm Recovery',      desc: 'Low vol, long calm streak' },
  { id: 'volatility_pickup',  icon: '📈', label: 'Volatility Pickup',  desc: 'VIX rising, still near highs' },
  { id: 'growth_scare',       icon: '📉', label: 'Growth Scare',       desc: 'Moderate selloff, vol elevated' },
  { id: 'panic_shock',        icon: '⚡', label: 'Panic Shock',        desc: 'Sharp VIX spike, deep drawdown' },
  { id: 'slow_deterioration', icon: '🐌', label: 'Slow Deterioration', desc: 'Grinding lower, no single spike' },
]

const SLIDER_KEYS_FOR_SENSITIVITY = [
  'vix_level', 'vix_chg_5d', 'rv_20d_pct', 'drawdown_pct_504d', 'ret_20d', 'dist_sma50',
] as const

const SENSITIVITY_COLORS = { high: '#f87171', medium: '#fbbf24', low: '#475569' } as const

const PERCENTILE_KEYS = new Set(['rv_20d_pct', 'drawdown_pct_504d'])

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

  const positiveDrivers = data?.driver_deltas.filter(d => d.delta_value > 0) ?? []
  const offsetDriver = (
    data?.driver_deltas?.length &&
    data.driver_deltas[0].delta_value > 0
  ) ? (data.driver_deltas.find(d => d.delta_value < 0) ?? null) : null

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
              {PRESET_BUTTONS.map(p => (
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

                {/* Secondary stats */}
                <div className="flex items-center gap-4 mb-2">
                  <span className="text-[9px]" style={{ color: '#64748b' }}>
                    Non-calm:{' '}
                    <span className="font-semibold">
                      {((1 - data.prob_calm) * 100).toFixed(0)}%
                    </span>
                  </span>
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
                <p className="text-[10px] mb-3" style={{ color: '#94a3b8' }}>
                  Biggest input shifts driving the scenario difference
                </p>

                {positiveDrivers.map((d, i) => {
                  const baselineVal = data.baseline_inputs?.[d.feature] ?? null
                  const scenarioVal = baselineVal != null ? baselineVal + d.delta_value : null
                  return (
                    <div key={d.feature} className="flex items-start gap-2.5 mb-3">
                      <span
                        className="text-[10px] font-bold shrink-0 mt-0.5"
                        style={{ color: '#f87171', width: 20 }}
                      >
                        #{i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>
                          {d.plain_label}
                        </div>
                        {baselineVal != null && scenarioVal != null && (
                          <div className="text-[9px] mt-0.5" style={{ color: '#475569' }}>
                            {formatDriverVal(d.feature, baselineVal)} → {formatDriverVal(d.feature, scenarioVal)}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold shrink-0" style={{ color: '#f87171' }}>
                        +{d.delta_value.toFixed(2)}
                      </span>
                    </div>
                  )
                })}

                {offsetDriver && (
                  <div className="mt-1 pt-3" style={{ borderTop: '1px solid #151d2e' }}>
                    <div className="flex items-start gap-2.5">
                      <span
                        className="text-[10px] font-bold shrink-0 mt-0.5"
                        style={{ color: '#4ade80' }}
                      >
                        ↓
                      </span>
                      <div className="flex-1">
                        <div className="text-[10px] font-semibold" style={{ color: '#4ade80' }}>
                          {offsetDriver.plain_label}{' '}
                          <span className="font-normal text-[9px]" style={{ color: '#475569' }}>
                            (partially offsetting)
                          </span>
                        </div>
                        <div className="text-[9px] mt-0.5" style={{ color: '#475569' }}>
                          {offsetDriver.plain_label} is limiting how stressed this scenario becomes.
                        </div>
                      </div>
                    </div>
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
