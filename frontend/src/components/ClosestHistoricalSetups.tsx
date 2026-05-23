import AnalogCard from './AnalogCard'
import type { AnalogsResponse } from '../types/api'

interface ClosestHistoricalSetupsProps {
  data: AnalogsResponse
}

export default function ClosestHistoricalSetups({ data }: ClosestHistoricalSetupsProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3">
      <div>
        <div className="text-sm font-semibold text-white/80">Closest Historical Setups</div>
        <div className="text-xs text-white/40 mt-0.5">
          Nearest matches in RegimeRadar&apos;s 22-feature signal space — not price-pattern matching
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {data.analogs.map((analog) => (
          <AnalogCard key={analog.full_date} analog={analog} />
        ))}
      </div>

      <div className="text-xs text-white/30 leading-snug">
        Outcome variance is the honest answer — these are three different histories, not an average.
      </div>
    </div>
  )
}
