import { motion } from 'framer-motion'
import type { StressLadderRow } from '../../lib/currentStateBriefing'
import { colors } from '../../lib/tokens'

interface StressLadderProps {
  rows: StressLadderRow[]
}

function formatValue(value: number) {
  if (Math.abs(value) <= 1) return `${(value * 100).toFixed(0)}%`
  return value.toFixed(1)
}

function formatDelta(delta: number | null) {
  if (delta === null) return 'Recent delta unavailable'
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} recent delta`
}

function statusLabel(status: StressLadderRow['status']) {
  if (status === 'stress') return 'Stress'
  if (status === 'watch') return 'Watch'
  return 'Calm'
}

function statusColor(status: StressLadderRow['status']) {
  if (status === 'stress') return colors.red
  if (status === 'watch') return colors.amber
  return colors.green
}

function markerPosition(row: StressLadderRow) {
  const low = Math.min(row.calmMax, row.stressMin)
  const high = Math.max(row.calmMax, row.stressMin)
  const range = high - low

  if (range === 0) return 50

  const rawPosition = row.calmMax < row.stressMin
    ? (row.value - low) / range
    : (high - row.value) / range

  return Math.min(100, Math.max(0, rawPosition * 100))
}

export default function StressLadder({ rows }: StressLadderProps) {
  if (rows.length === 0) return null

  return (
    <section
      aria-label="Stress Ladder"
      className="rounded-xl p-5"
      style={{ background: colors.glass, border: `1px solid ${colors.border}` }}
    >
      <div className="mb-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: colors.textDim }}>
          Stress Ladder
        </div>
        <div className="mt-1 text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
          Live conditions shown as directional calm-to-stress guides, not regime rules.
        </div>
      </div>

      <div className="space-y-5">
        {rows.map((row, index) => {
          const color = statusColor(row.status)
          const watchCopy = row.status === 'stress' ? row.watchLower : row.watchHigher

          return (
            <div key={row.feature} className="grid gap-3 md:grid-cols-[minmax(132px,180px)_1fr_minmax(72px,96px)] md:items-center">
              <div className="min-w-0">
                <div className="text-sm font-bold leading-tight" style={{ color: colors.textPrimary }}>
                  {row.label}
                </div>
                <div className="mt-1 text-[11px] leading-snug" style={{ color: colors.textDim }}>
                  {formatDelta(row.delta)}
                </div>
              </div>

              <div className="min-w-0">
                <div className="relative h-3 overflow-hidden rounded-full" style={{ background: '#0d1626' }}>
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(90deg, rgba(74,222,128,.52), rgba(251,191,36,.62), rgba(248,113,113,.76))',
                    }}
                  />
                  <motion.div
                    className="absolute top-1/2 h-6 w-6 rounded-full border"
                    style={{
                      left: `${markerPosition(row)}%`,
                      transform: 'translate(-50%, -50%)',
                      background: '#e5edf7',
                      borderColor: color,
                      boxShadow: `0 0 18px ${color}66`,
                    }}
                    initial={{ scale: 0.75, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.04, duration: 0.25 }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] font-semibold" style={{ color: colors.textDim }}>
                  <span>Calm</span>
                  <span>Stress</span>
                </div>
                <div className="mt-1 text-[11px] leading-snug" style={{ color: colors.textSecondary }}>
                  {watchCopy}
                </div>
              </div>

              <div className="md:text-right">
                <div className="text-lg font-black tabular-nums leading-none" style={{ color: colors.textPrimary }}>
                  {formatValue(row.value)}
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color }}>
                  {statusLabel(row.status)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
