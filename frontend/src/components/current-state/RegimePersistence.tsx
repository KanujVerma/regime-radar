import type { RegimePersistence as RegimePersistenceData } from '../../lib/currentStateBriefing'
import { colors } from '../../lib/tokens'

type RegimePersistenceCardData = RegimePersistenceData & {
  regime: string
}

interface RegimePersistenceProps {
  data: RegimePersistenceCardData | null
}

export default function RegimePersistence({ data }: RegimePersistenceProps) {
  if (!data) return null

  return (
    <section
      aria-label="Regime Persistence"
      className="rounded-xl p-4"
      style={{ background: colors.glass, border: `1px solid ${colors.border}` }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: colors.textDim }}>
        Regime Persistence
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-black tabular-nums" style={{ color: colors.textPrimary }}>
            {data.daysInRegime}
          </div>
          <div className="text-[11px]" style={{ color: colors.textSecondary }}>
            trading days in {data.regime}
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: '#38bdf8' }}>
          {data.label}
        </div>
      </div>
    </section>
  )
}
