import type { MarketContextCard } from '../../lib/currentStateBriefing'
import { colors } from '../../lib/tokens'

interface MarketContextBriefProps {
  cards: MarketContextCard[]
}

export default function MarketContextBrief({ cards }: MarketContextBriefProps) {
  if (cards.length === 0) return null

  return (
    <section
      aria-label="Market Context Brief"
      className="rounded-xl p-5"
      style={{ background: colors.glass, border: `1px solid ${colors.border}` }}
    >
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: colors.textDim }}>
          Possible Market Context
        </div>
        <div className="mt-1 text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
          Context is tied to changed conditions and is not treated as model evidence.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.slice(0, 3).map((card) => (
          <article
            key={`${card.title}-${card.body}`}
            className="min-h-[120px] rounded-lg p-3"
            style={{ background: '#08111f', border: '1px solid rgba(148,163,184,0.16)' }}
          >
            <div className="text-sm font-bold leading-snug" style={{ color: colors.textPrimary }}>
              {card.title}
            </div>
            <div className="mt-2 text-[11px] leading-relaxed" style={{ color: colors.textSecondary }}>
              {card.body}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
