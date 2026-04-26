import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import RiskRail from '../components/charts/RiskRail'
import { useScenario } from '../hooks/useScenario'
import { SLIDER_CONFIG, PRESETS, type ScenarioInputs } from '../lib/sliderConfig'
import { DEFAULT_THRESHOLD } from '../lib/constants'
import { useModelDrivers } from '../hooks/useModelDrivers'

const DEFAULT_INPUTS: ScenarioInputs = {
  vix_level: 18, vix_chg_5d: 0, rv_20d_pct: 0.40,
  drawdown_pct_504d: 0.05, ret_20d: 0.01, dist_sma50: 0.01,
}

function sliderColor(cfg: (typeof SLIDER_CONFIG)[0], val: number): string {
  if (val <= cfg.calmMax) return '#06b6d4'
  if (val >= cfg.stressMin) return '#f87171'
  return '#fbbf24'
}

export default function ScenarioExplorer() {
  const [inputs, setInputs] = useState<ScenarioInputs>(DEFAULT_INPUTS)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const { data, loading, error } = useScenario(inputs)
  const { data: modelData } = useModelDrivers()

  const reset = useCallback(() => setInputs(DEFAULT_INPUTS), [])

  const sweepRow = modelData?.threshold_sweep?.find(r => Math.abs(r.threshold - threshold) < 0.05)

  const narrative = data
    ? buildNarrative(inputs, data.baseline_prob_turbulent, data.prob_turbulent, data.driver_deltas[0]?.plain_label ?? '', data.prob_calm)
    : null

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
        {/* Left column */}
        <div className="shrink-0 space-y-4" style={{ width: 276 }}>
          <Panel title="Quick scenarios">
            <div className="flex flex-col gap-2">
              {[
                { id: 'calm', icon: '🌤', label: 'Calm' },
                { id: 'choppy', icon: '⚡', label: 'Choppy' },
                { id: 'stress', icon: '🔴', label: 'Stress Spike' },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setInputs(PRESETS[p.id])}
                  className="text-[11px] font-semibold px-3 py-2 rounded-lg text-left"
                  style={{ background: '#080b12', border: '1px solid #151d2e', color: '#94a3b8' }}
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </Panel>

          <div className="h-px" style={{ background: '#151d2e' }} />

          <div className="space-y-4">
            {SLIDER_CONFIG.map(cfg => {
              const val = inputs[cfg.key]
              const color = sliderColor(cfg, val)
              return (
                <div key={cfg.key}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>{cfg.label}</span>
                    <span className="text-[10px] font-bold" style={{ color }}>{val.toFixed(cfg.step < 0.1 ? 2 : 1)}</span>
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

          {/* Threshold slider */}
          <div>
            <div className="text-[9px] font-bold tracking-widest uppercase mb-2" style={{ color: '#4a6080' }}>Alert threshold</div>
            <div className="flex justify-between mb-1">
              <span className="text-[10px]" style={{ color: '#94a3b8' }}>Threshold</span>
              <span className="text-[10px] font-bold" style={{ color: '#fbbf24' }}>{(threshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range" min={0.10} max={0.70} step={0.10}
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-full cursor-pointer"
              style={{ accentColor: '#fbbf24' }}
            />
            {sweepRow ? (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  { label: 'Crises caught', value: `${(sweepRow.recall * 100).toFixed(0)}%` },
                  { label: 'False alarms', value: `${(sweepRow.false_alert_rate * 100).toFixed(0)}%` },
                  { label: 'Avg warning', value: `${sweepRow.avg_lead_time_days.toFixed(0)}d` },
                ].map(m => (
                  <div key={m.label} className="rounded-lg p-2 text-center" style={{ background: '#080b12', border: '1px solid #151d2e' }}>
                    <div className="text-[8px] tracking-wide uppercase" style={{ color: '#4a6080' }}>{m.label}</div>
                    <div className="text-[14px] font-extrabold" style={{ color: '#94a3b8' }}>{m.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[9px] mt-2" style={{ color: '#94a3b8' }}>Threshold data unavailable</p>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex-1 space-y-4">
          {loading && <div className="text-slate-500 text-sm">Calculating…</div>}
          {error && <div className="text-red-400 text-sm">{error}</div>}

          {data && (
            <>
              <Panel title="Chance of severe market stress — current vs your scenario">
                <RiskRail baselineRisk={data.baseline_prob_turbulent} scenarioRisk={data.prob_turbulent} />
              </Panel>

              <Panel title="How each market state shifts under your scenario">
                {(['calm', 'elevated', 'turbulent'] as const).map(r => {
                  const base = data[`baseline_prob_${r}` as keyof typeof data] as number
                  const scen = data[`prob_${r}` as keyof typeof data] as number
                  const colors = { calm: '#4ade80', elevated: '#fbbf24', turbulent: '#f87171' }
                  const c = colors[r]
                  const diff = scen - base
                  const diffLabel = diff === 0 ? 'no change' : `${diff > 0 ? '+' : ''}${(diff * 100).toFixed(0)}pp`
                  const diffColor = diff > 0.02 ? '#f87171' : diff < -0.02 ? '#4ade80' : '#64748b'
                  return (
                    <div key={r} className="flex items-center gap-3 mb-4">
                      <div className="w-20 text-[10px] font-semibold capitalize shrink-0" style={{ color: '#94a3b8' }}>{r}</div>
                      <div className="flex-1 relative" style={{ height: 20 }}>
                        {/* Track */}
                        <div className="absolute inset-0 rounded-full" style={{ background: '#151d2e', top: 7, bottom: 7 }} />
                        {/* Scenario fill */}
                        <div
                          className="absolute rounded-full"
                          style={{ left: 0, width: `${scen * 100}%`, background: c, top: 7, bottom: 7 }}
                        />
                        {/* Baseline tick */}
                        <div
                          className="absolute rounded-full"
                          style={{
                            left: `${base * 100}%`, width: 2,
                            top: 4, bottom: 4,
                            background: `${c}70`,
                            transform: 'translateX(-50%)',
                          }}
                        />
                      </div>
                      <div className="text-right shrink-0" style={{ width: 100 }}>
                        <div className="text-[10px] font-bold" style={{ color: c }}>
                          {(base * 100).toFixed(0)}% → {(scen * 100).toFixed(0)}%
                        </div>
                        <div className="text-[9px] font-semibold" style={{ color: diffColor }}>{diffLabel}</div>
                      </div>
                    </div>
                  )
                })}
              </Panel>

              {narrative && (
                <Panel title="What this scenario means">
                  <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>{narrative}</p>
                </Panel>
              )}

              <Panel title="What changed the most">
                <p className="text-[10px] mb-3" style={{ color: '#94a3b8' }}>Biggest input shifts driving the scenario difference</p>
                {data.driver_deltas.map(d => (
                  <div key={d.feature} className="flex justify-between items-center mb-2">
                    <span className="text-[10px]" style={{ color: '#94a3b8' }}>{d.plain_label}</span>
                    <span
                      className="text-[10px] font-bold"
                      style={{ color: d.delta_value > 0 ? '#f87171' : '#4ade80' }}
                    >
                      {d.delta_value > 0 ? '+' : ''}{d.delta_value.toFixed(3)}
                    </span>
                  </div>
                ))}
              </Panel>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function buildNarrative(
  inputs: ScenarioInputs,
  baseRisk: number,
  scenRisk: number,
  topDriver: string,
  probCalm: number,
): string {
  const delta = scenRisk - baseRisk
  const direction = delta > 0.02 ? 'raises' : delta < -0.02 ? 'lowers' : 'leaves roughly unchanged'

  const changed = Object.keys(inputs).filter(k => {
    const cfg = SLIDER_CONFIG.find(s => s.key === k)
    return cfg && Math.abs((inputs as Record<string, number>)[k] - DEFAULT_INPUTS[k as keyof ScenarioInputs]) > cfg.step * 2
  })

  const changedLabel = changed.length > 0
    ? changed.slice(0, 2).map(k => SLIDER_CONFIG.find(s => s.key === k)?.label ?? k).join(' and ')
    : 'these inputs'

  const parts: string[] = [
    `This scenario ${direction} the turbulent regime probability from ${(baseRisk * 100).toFixed(0)}% to ${(scenRisk * 100).toFixed(0)}%.`,
  ]
  if (changed.length > 0) parts.push(`The biggest input change is ${changedLabel}.`)
  if (topDriver) parts.push(`The model is most sensitive to ${topDriver}.`)
  if (probCalm < 0.4) parts.push('The probability of a calm market drops significantly under these conditions.')
  return parts.join(' ')
}
