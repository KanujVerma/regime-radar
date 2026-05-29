import { motion } from 'framer-motion'
import type { RiskTemperature as RiskTemperatureData } from '../../lib/currentStateBriefing'
import { colors } from '../../lib/tokens'

interface RiskTemperatureProps {
  data: RiskTemperatureData
}

function formatRisk(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

export default function RiskTemperature({ data }: RiskTemperatureProps) {
  const marker = data.percentile === null ? 0 : Math.min(100, Math.max(0, data.percentile))
  const percentileLabel = data.percentile === null ? 'No percentile' : `${data.percentile}th percentile`

  return (
    <section
      aria-label="Risk Temperature"
      className="rounded-xl p-5"
      style={{ background: colors.glass, border: `1px solid ${colors.border}` }}
    >
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: colors.textDim }}>
            Risk Temperature
          </div>
          <div className="mt-1 max-w-xl text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
            How unusual today's transition risk is versus history.
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <div className="text-3xl font-black tabular-nums leading-none" style={{ color: colors.textPrimary }}>
            {formatRisk(data.currentRisk)}
          </div>
          <div className="mt-1 text-[11px] font-semibold" style={{ color: colors.textSecondary }}>
            {data.label}
          </div>
        </div>
      </div>

      <div className="relative h-4 overflow-hidden rounded-full" style={{ background: '#101827' }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(74,222,128,.58) 0%, rgba(251,191,36,.66) 62%, rgba(249,115,22,.78) 84%, rgba(248,113,113,.92) 100%)',
          }}
        />
        <motion.div
          className="absolute top-1/2 h-7 w-1.5 rounded-full"
          style={{
            left: `${marker}%`,
            background: colors.textPrimary,
            transform: 'translate(-50%, -50%)',
          }}
          initial={{ scaleY: 0.6, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 0.35 }}
        />
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] gap-2 text-[10px] font-semibold" style={{ color: colors.textDim }}>
        <span>Common</span>
        <span className="text-center">{percentileLabel}</span>
        <span className="text-right">Extreme</span>
      </div>
    </section>
  )
}
