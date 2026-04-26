import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import DriverBar from '../components/ui/DriverBar'
import { useModelDrivers } from '../hooks/useModelDrivers'
import { labelFor } from '../lib/featureLabels'

export default function ModelDrivers() {
  const { data, loading, error } = useModelDrivers()

  if (loading) return <div className="p-6 text-slate-500 text-sm">Loading…</div>
  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>
  if (!data) return null

  const sorted = [...data.global_importance].sort((a, b) => b.importance - a.importance)
  const topUp = sorted.slice(0, 8)
  const maxImp = topUp[0]?.importance ?? 0.001

  const localEntries = Object.entries(data.local_explanation).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  const pushing = localEntries.filter(([, v]) => v > 0).slice(0, 3)
  const holding = localEntries.filter(([, v]) => v < 0).slice(0, 3)

  const topFeatureLabel = labelFor(sorted[0]?.feature ?? '')

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar title="Model Drivers" />
      <div className="p-5 space-y-5">
        <Panel title="What usually raises risk">
          <p className="text-[10px] mb-4" style={{ color: '#94a3b8' }}>
            These inputs have the strongest upward effect on transition risk across all historical predictions.
          </p>
          {topUp.map(d => (
            <DriverBar key={d.feature} feature={d.feature} importance={d.importance} maxImportance={maxImp} positive />
          ))}
        </Panel>

        <div className="h-px" style={{ background: '#151d2e' }} />

        <Panel title="Why the latest reading looks this way">
          <p className="text-[10px] mb-4" style={{ color: '#94a3b8' }}>
            Each feature's contribution to today's risk score — positive values push risk higher, negative values hold it down.
          </p>
          {pushing.length > 0 || holding.length > 0 ? (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-[10px] font-bold mb-3" style={{ color: '#06b6d4' }}>What pushed risk higher</div>
                {pushing.map(([feat, val]) => (
                  <div key={feat} className="flex justify-between items-center mb-2">
                    <span className="text-[10px]" style={{ color: '#94a3b8' }}>{labelFor(feat)}</span>
                    <span className="text-[10px] font-bold" style={{ color: '#f87171' }}>+{(val * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[10px] font-bold mb-3" style={{ color: '#4ade80' }}>What held risk down</div>
                {holding.map(([feat, val]) => (
                  <div key={feat} className="flex justify-between items-center mb-2">
                    <span className="text-[10px]" style={{ color: '#94a3b8' }}>{labelFor(feat)}</span>
                    <span className="text-[10px] font-bold" style={{ color: '#4ade80' }}>{(val * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px]" style={{ color: '#94a3b8' }}>
              Overall, <strong style={{ color: '#f1f5f9' }}>{topFeatureLabel}</strong> has the largest influence on this model's transition risk estimates across all historical predictions.
            </p>
          )}
        </Panel>
      </div>
    </motion.div>
  )
}
