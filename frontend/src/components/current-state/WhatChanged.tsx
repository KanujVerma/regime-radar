import type { ChangeRow } from '../../lib/currentStateBriefing'
import { colors } from '../../lib/tokens'

interface WhatChangedProps {
  rows: ChangeRow[]
}

const directionGlyph = {
  up: '+',
  down: '-',
  flat: '=',
} as const

const directionColor = {
  up: '#f97316',
  down: colors.green,
  flat: colors.textDim,
} as const

const directionLabel = {
  up: 'Stress increased',
  down: 'Stress eased',
  flat: 'Little changed',
} as const

function formatValue(value: ChangeRow['value']) {
  if (typeof value === 'number') {
    if (Math.abs(value) <= 1) return `${(value * 100).toFixed(1)}%`
    return value.toFixed(1)
  }
  return value
}

export default function WhatChanged({ rows }: WhatChangedProps) {
  return (
    <section
      aria-label="What Changed"
      className="rounded-xl p-5"
      style={{ background: colors.glass, border: `1px solid ${colors.border}` }}
    >
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: colors.textDim }}>
          What Changed
        </div>
        <div className="mt-1 text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
          Recent movement in the live regime read.
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <div
            key={row.feature}
            className="min-h-[104px] rounded-lg p-3"
            style={{ background: '#08111f', border: '1px solid rgba(148,163,184,0.16)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: colors.textDim }}>
                {row.label}
              </div>
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-black"
                style={{ color: directionColor[row.direction], background: `${directionColor[row.direction]}14` }}
                role="img"
                aria-label={directionLabel[row.direction]}
              >
                {directionGlyph[row.direction]}
              </div>
            </div>
            <div className="mt-2 break-words text-xl font-black tabular-nums leading-tight" style={{ color: colors.textPrimary }}>
              {formatValue(row.value)}
            </div>
            <div className="mt-1 text-[11px] leading-snug" style={{ color: colors.textSecondary }}>
              {row.summary}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
