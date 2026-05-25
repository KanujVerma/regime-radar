import AnalogCard from './AnalogCard'
import type { AnalogsResponse } from '../types/api'
import { colors } from '../lib/tokens'

interface ClosestHistoricalSetupsProps {
  data: AnalogsResponse
}

export default function ClosestHistoricalSetups({ data }: ClosestHistoricalSetupsProps) {
  return (
    <div style={{
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      background: colors.surfaceElevated,
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.textSecondary }}>Closest Historical Setups</div>
        <div style={{ fontSize: 12, color: colors.textDim, marginTop: 2 }}>
          Nearest matches in RegimeRadar&apos;s 22-feature signal space — not price-pattern matching
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {data.analogs.map((analog) => (
          <AnalogCard key={analog.full_date} analog={analog} />
        ))}
      </div>

      <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.4 }}>
        Outcome variance is the honest answer — these are three different histories, not an average.
      </div>
    </div>
  )
}
