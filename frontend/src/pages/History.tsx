import { useState } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import RegimeLegend from '../components/ui/RegimeLegend'
import RegimeChart from '../components/charts/RegimeChart'
import RiskLineChart from '../components/charts/RiskLineChart'
import SkeletonBlock from '../components/ui/SkeletonBlock'
import { useHistoricalState } from '../hooks/useHistoricalState'
import { useChangelog } from '../hooks/useChangelog'
import ChangelogFeed from '../components/ui/ChangelogFeed'

export default function History() {
  const [showVix, setShowVix] = useState(false)
  const { data, loading, error } = useHistoricalState()
  const { data: changelog, loading: changelogLoading, error: changelogError } = useChangelog()

  if (loading) return (
    <div className="p-6 space-y-5">
      <SkeletonBlock height="280px" />
      <SkeletonBlock height="220px" />
      <SkeletonBlock height="120px" />
    </div>
  )
  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>
  if (!data) return null

  const toggleBtn = (
    <button
      onClick={() => setShowVix(v => !v)}
      className="text-[10px] font-bold px-3 py-1.5 rounded card-hover"
      style={{
        background: showVix ? '#0e4d6e' : '#0c1020',
        border: `1px solid ${showVix ? '#06b6d4' : '#1a2540'}`,
        color: showVix ? '#06b6d4' : '#64748b',
        transition: 'background 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out',
      }}
    >
      {showVix ? '▼ Hide VIX' : '▲ Overlay VIX'}
    </button>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <Topbar title="History" subtitle={`${data.start} — ${data.end}`} />
      <div className="px-6 py-5 space-y-6">
        <Panel title="What happened over time?">
          <p className="text-[10px] mb-2" style={{ color: '#94a3b8' }}>
            Shaded bands show the market regime on each day. A darker shade indicates higher stress.
          </p>
          <div className="mb-2">
            <RegimeLegend />
          </div>
          <div className="flex justify-end mb-2">{toggleBtn}</div>
          <RegimeChart data={data.data} showVix={showVix} />
        </Panel>
        <Panel title="When did the model get worried?">
          <p className="text-[10px] mb-3" style={{ color: '#94a3b8' }}>
            The line shows the model's daily estimate of the chance conditions worsen within the next week.
          </p>
          <RiskLineChart data={data.data} />
        </Panel>
        <Panel title="Notable days">
          {changelogLoading && <SkeletonBlock height="120px" />}
          {changelogError && <div className="text-slate-500 text-xs">{changelogError}</div>}
          {changelog && <ChangelogFeed data={changelog} />}
        </Panel>
      </div>
    </motion.div>
  )
}
