import { useState } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import MetricCard from '../components/ui/MetricCard'
import EventReplayChart from '../components/charts/EventReplayChart'
import Scrubber from '../components/charts/Scrubber'
import SegmentedControl from '../components/ui/SegmentedControl'
import SkeletonBlock from '../components/ui/SkeletonBlock'
import { useScrubber } from '../hooks/useScrubber'
import { useEventReplay } from '../hooks/useEventReplay'
import { colors } from '../lib/tokens'
import { EVENTS, EVENT_CONTENT } from '../lib/eventContent'

export default function EventReplay() {
  const [selectedEvent, setSelectedEvent] = useState<string>(EVENTS[0].value)
  const { data, loading, error } = useEventReplay(selectedEvent)

  const totalFrames = data?.data.length ?? 0
  const scrubber = useScrubber({ totalFrames, playbackMs: 80 })
  const { frame } = scrubber

  const currentPoint = data?.data[frame]

  const frameLabel = (f: number) => {
    const pt = data?.data[f]
    if (!pt) return ''
    const risk = pt.transition_risk != null ? `${(pt.transition_risk * 100).toFixed(1)}%` : '—'
    return `${pt.date} · risk ${risk}`
  }

  const peakSoFar = data?.data.slice(0, frame + 1).reduce((m, p) => Math.max(m, p.transition_risk ?? 0), 0) ?? 0
  const alertDaysSoFar = data?.data.slice(0, frame + 1).filter(p => (p.transition_risk ?? 0) > 0.3).length ?? 0

  const content = EVENT_CONTENT[selectedEvent]

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <Topbar title="Event Replay" />
      <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <SegmentedControl
          options={[...EVENTS]}
          value={selectedEvent}
          onChange={(v) => { setSelectedEvent(v); scrubber.seek(0) }}
        />

        {loading && (
          <div className="space-y-4">
            <SkeletonBlock height="300px" />
            <SkeletonBlock height="60px" />
          </div>
        )}
        {error && <div className="text-red-400 text-sm">{error}</div>}

        {!loading && !error && data && (
          <>
            {/* Stat cards — live at playhead */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricCard label="Days into event" value={String(frame + 1)} />
              <MetricCard
                label="Risk today"
                value={currentPoint?.transition_risk != null ? `${(currentPoint.transition_risk * 100).toFixed(1)}%` : '—'}
              />
              <MetricCard label="Peak risk so far" value={`${(peakSoFar * 100).toFixed(1)}%`} />
              <MetricCard label="Alert days so far" value={String(alertDaysSoFar)} />
            </div>

            {/* Replay chart + scrubber */}
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px 8px', borderBottom: `1px solid ${colors.border}` }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: colors.textMuted }}>
                  Transition Risk & Regime
                </span>
              </div>
              <div style={{ height: 300 }}>
                <EventReplayChart
                  data={data.data}
                  playheadDate={currentPoint?.date}
                  visibleUpTo={currentPoint?.date}
                />
              </div>
              <Scrubber scrubber={scrubber} totalFrames={totalFrames} frameLabel={frameLabel} />
            </div>

            {/* Narrative */}
            {content && (
              <Panel title="What happened">
                <p style={{ fontSize: 13, color: colors.textSecondary, margin: 0, lineHeight: 1.7 }}>{content.description}</p>
              </Panel>
            )}

            {/* Takeaway */}
            {content && (
              <Panel title="Takeaway">
                <p style={{ fontSize: 13, color: colors.textSecondary, margin: 0, lineHeight: 1.7 }}>{content.takeaway}</p>
              </Panel>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
