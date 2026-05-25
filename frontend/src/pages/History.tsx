import { useState } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import ChartShell from '../components/charts/ChartShell'
import RegimeChart from '../components/charts/RegimeChart'
import RiskLineChart from '../components/charts/RiskLineChart'
import ChangelogFeed from '../components/ui/ChangelogFeed'
import SkeletonBlock from '../components/ui/SkeletonBlock'
import { useHistoricalState } from '../hooks/useHistoricalState'
import { useChangelog } from '../hooks/useChangelog'
import { regimeColor } from '../lib/tokens'

const DEFAULT_START = '2020-01-01'

export default function History() {
  const [start, setStart] = useState(DEFAULT_START)
  const [end, setEnd] = useState<string | undefined>(undefined)
  const [showVix, setShowVix] = useState(false)
  const [hoverX, setHoverX] = useState<string | null>(null)
  const [pinnedDate, setPinnedDate] = useState<string | null>(null)

  const { data, loading, error } = useHistoricalState(start, end)
  const { data: changelog, loading: clLoading } = useChangelog()

  const latestRegime = data?.data[data.data.length - 1]?.regime ?? 'unknown'
  const rColor = regimeColor[latestRegime] ?? '#64748b'

  const dateRangeControl = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={() => setShowVix(v => !v)}
        style={{
          fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid',
          borderColor: showVix ? rColor : '#243348',
          background: showVix ? `${rColor}18` : 'transparent',
          color: showVix ? rColor : '#64748b',
          cursor: 'pointer',
        }}
      >
        VIX
      </button>
      <input
        type="date"
        value={start}
        max={end ?? new Date().toISOString().slice(0, 10)}
        onChange={e => setStart(e.target.value)}
        style={{ fontSize: 11, background: '#0a0e1a', border: '1px solid #243348', borderRadius: 5, color: '#94a3b8', padding: '3px 6px' }}
      />
      <span style={{ fontSize: 11, color: '#4a6080' }}>→</span>
      <input
        type="date"
        value={end ?? ''}
        min={start}
        onChange={e => setEnd(e.target.value || undefined)}
        style={{ fontSize: 11, background: '#0a0e1a', border: '1px solid #243348', borderRadius: 5, color: '#94a3b8', padding: '3px 6px' }}
      />
      {end && (
        <button onClick={() => setEnd(undefined)} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
      )}
    </div>
  )

  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <Topbar title="History" subtitle={loading ? 'Loading…' : `${data?.start ?? start} – ${data?.end ?? 'today'}`} />
      <div style={{ padding: '1.25rem 1.5rem' }}>
        {loading ? (
          <div className="space-y-4">
            <SkeletonBlock height="320px" />
            <SkeletonBlock height="240px" />
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1.5rem', alignItems: 'start' }}
            className="grid-cols-1 lg:grid-cols-[1fr_300px]">
            {/* Left: linked chart stack */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <ChartShell title="Regime & SPY" height="tall" headerRight={dateRangeControl} regimeGlowColor={`${rColor}18`}>
                <RegimeChart
                  data={data?.data ?? []}
                  showVix={showVix}
                  syncHoverX={hoverX}
                  onSyncHoverX={setHoverX}
                  pinnedDate={pinnedDate}
                />
              </ChartShell>
              <ChartShell title="Transition Risk">
                <RiskLineChart
                  data={data?.data ?? []}
                  syncHoverX={hoverX}
                  onSyncHoverX={setHoverX}
                />
              </ChartShell>
            </div>
            {/* Right: companion feed */}
            <Panel title="Notable Days">
              <ChangelogFeed
                entries={changelog?.entries ?? []}
                loading={clLoading}
                highlightDate={pinnedDate}
                onEntryClick={date => setPinnedDate(d => d === date ? null : date)}
              />
            </Panel>
          </div>
        )}
      </div>
    </motion.div>
  )
}
