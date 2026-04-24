import { useState } from 'react'
import { motion } from 'framer-motion'
import Topbar from '../components/layout/Topbar'
import Panel from '../components/ui/Panel'
import MetricCard from '../components/ui/MetricCard'
import EventReplayChart from '../components/charts/EventReplayChart'
import RegimeLegend from '../components/ui/RegimeLegend'
import { useEventReplay } from '../hooks/useEventReplay'
import { DEFAULT_THRESHOLD } from '../lib/constants'

const EVENTS = [
  { id: 'financial_crisis_2008', label: '2008 Financial Crisis' },
  { id: 'covid_2020', label: 'COVID-19 2020' },
  { id: 'tightening_2022', label: 'Rate Tightening 2022' },
]

const EVENT_CONTENT: Record<string, { description: string; takeaway: string }> = {
  financial_crisis_2008: {
    description: 'The 2008 financial crisis saw SPY fall more than 50% from peak as credit markets seized.',
    takeaway: 'The model began flagging elevated risk roughly 3–4 weeks before the peak stress period. Risk stayed above the alert threshold for much of the window, reflecting the prolonged nature of the crisis rather than a single spike.',
  },
  covid_2020: {
    description: 'The COVID-19 market crash in early 2020 was one of the fastest equity declines on record.',
    takeaway: "This was the sharpest test — the model caught the transition but with less lead time than 2008, consistent with how rapidly conditions deteriorated. Peak risk reached the model's highest recorded readings during the window.",
  },
  tightening_2022: {
    description: 'The 2022 rate-tightening cycle saw aggressive Fed hikes as inflation reached 40-year highs.',
    takeaway: 'Unlike the prior two events, 2022 was a slow-burn elevated regime rather than a sudden crash. The model reflected this — risk stayed persistently moderate rather than spiking sharply, and the regime held Elevated for most of the year.',
  },
}

export default function EventReplay() {
  const [selected, setSelected] = useState('financial_crisis_2008')
  const { data, loading, error } = useEventReplay(selected)

  const pts = data?.data ?? []
  const peakRisk = pts.length ? Math.max(...pts.map(p => p.transition_risk ?? 0)) : null
  const alertDays = pts.filter(p => (p.transition_risk ?? 0) > DEFAULT_THRESHOLD).length
  const firstCrossing = pts.find(p => (p.transition_risk ?? 0) > DEFAULT_THRESHOLD)?.date ?? '—'
  const highStressDays = pts.filter(p => p.regime_actual === 'elevated' || p.regime_actual === 'turbulent').length

  const content = EVENT_CONTENT[selected]

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Topbar title="Event Replay" />
      <div className="p-5 space-y-4">
        {/* Event selector */}
        <div className="flex gap-2">
          {EVENTS.map(e => (
            <button
              key={e.id}
              onClick={() => setSelected(e.id)}
              className="px-4 py-2 rounded-lg text-[11px] font-semibold transition-colors"
              style={{
                background: selected === e.id ? '#0e4d6e' : '#0c1020',
                border: `1px solid ${selected === e.id ? '#06b6d4' : '#151d2e'}`,
                color: selected === e.id ? '#06b6d4' : '#64748b',
              }}
            >
              {e.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-slate-500 text-sm">Loading…</div>}
        {error && <div className="text-red-400 text-sm">{error}</div>}

        {!loading && !error && data && (
          <>
            {/* Hero stats */}
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Warning Lead Time"
                value={data.warning_lead_days != null ? `${Math.round(data.warning_lead_days)}d` : '—'}
                subtitle="Days before peak stress the model flagged risk"
                valueColor="#06b6d4"
              />
              <MetricCard
                label="Peak Transition Risk"
                value={peakRisk != null ? `${(peakRisk * 100).toFixed(0)}%` : '—'}
                subtitle="Highest single-day risk reading"
                valueColor="#f87171"
              />
            </div>

            {/* Supporting stats */}
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Alert Days" value={`${alertDays}d`} subtitle={`Days risk > ${(DEFAULT_THRESHOLD * 100).toFixed(0)}%`} />
              <MetricCard label="First Threshold Crossing" value={firstCrossing} subtitle="First day risk exceeded watch threshold" />
              <MetricCard label="High-Stress Days" value={`${highStressDays}d`} subtitle="Days in Elevated or Turbulent regime" />
            </div>

            {/* Event description */}
            {content && (
              <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>{content.description}</p>
            )}

            {/* Methodology note */}
            <p className="text-[10px] italic" style={{ color: '#64748b' }}>
              Replay metrics are computed from out-of-fold predictions — each day in this window was scored by a model that did not train on that day.
            </p>

            {/* Chart */}
            <Panel title={`${EVENTS.find(e => e.id === selected)?.label} — Transition Risk & Regime`}>
              <div className="flex flex-wrap gap-4 items-center mb-2">
                <RegimeLegend />
              </div>
              <div className="flex flex-wrap gap-4 items-center mb-3" style={{ fontSize: 10, color: '#94a3b8' }}>
                <span className="flex items-center gap-1.5">
                  <svg width={16} height={8}><line x1="0" y1="4" x2="16" y2="4" stroke="#06b6d4" strokeWidth={2} /></svg>
                  Model risk score
                </span>
                <span className="flex items-center gap-1.5">
                  <span style={{ color: '#f87171' }}>✕</span>
                  Actual regime change
                </span>
                <span className="flex items-center gap-1.5">
                  <svg width={16} height={8}><line x1="0" y1="4" x2="16" y2="4" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="3 2" /></svg>
                  First alert crossing
                </span>
              </div>
              <EventReplayChart data={pts} />
            </Panel>

            {/* Takeaway */}
            {content && (
              <Panel title="Takeaway">
                <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>{content.takeaway}</p>
              </Panel>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
