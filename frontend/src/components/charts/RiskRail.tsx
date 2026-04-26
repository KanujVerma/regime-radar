import { motion } from 'framer-motion'
import { RISK_ZONES } from '../../lib/constants'

interface RiskRailProps {
  baselineRisk: number
  scenarioRisk: number
}

export default function RiskRail({ baselineRisk, scenarioRisk }: RiskRailProps) {
  const bPct = `${(baselineRisk * 100).toFixed(0)}%`
  const sPct = `${(scenarioRisk * 100).toFixed(0)}%`
  const delta = scenarioRisk - baselineRisk
  const deltaLabel = `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)} ppts`

  return (
    <div>
      {/* Numbers row */}
      <div className="flex items-center gap-4 mb-5">
        <div>
          <div className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: '#4a6080' }}>Current market</div>
          <div className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: '#4ade80' }}>{bPct}</div>
        </div>
        <div style={{ color: '#1e293b', fontSize: 24 }}>→</div>
        <div>
          <div className="text-[9px] font-bold tracking-widest uppercase mb-1" style={{ color: '#4a6080' }}>Your scenario</div>
          <div className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: '#f87171' }}>{sPct}</div>
        </div>
        <div
          className="px-3.5 py-1 rounded-full text-[13px] font-extrabold ml-2"
          style={{ background: '#450a0a30', border: '1px solid #7f1d1d40', color: '#f87171' }}
        >
          {deltaLabel}
        </div>
      </div>

      {/* Track */}
      <div className="relative" style={{ paddingTop: 16, paddingBottom: 28 }}>
        <div
          className="h-2.5 rounded-full"
          style={{
            background: 'linear-gradient(to right, #14532d 0%, #166534 15%, #92400e 30%, #d97706 50%, #b45309 65%, #7f1d1d 80%, #991b1b 100%)',
          }}
        />

        {/* Threshold markers */}
        {[
          { pct: 10, label: 'Watch · 10%', color: '#06b6d4', bg: '#061d2e', border: '#0e3d55' },
          { pct: 30, label: 'Alert · 30%', color: '#fbbf24', bg: '#451a0320', border: '#92400e40' },
        ].map(m => (
          <div
            key={m.pct}
            className="absolute flex flex-col items-center"
            style={{ left: `${m.pct}%`, top: 0, transform: 'translateX(-50%)' }}
          >
            <div
              className="w-px"
              style={{
                height: 10,
                background: `repeating-linear-gradient(to bottom, ${m.color} 0px, ${m.color} 4px, transparent 4px, transparent 8px)`,
              }}
            />
          </div>
        ))}

        {/* Baseline marker */}
        <motion.div
          className="absolute"
          style={{ top: 9, zIndex: 10 }}
          animate={{ left: `${baselineRisk * 100}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        >
          <div
            className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-extrabold"
            style={{
              transform: 'translateX(-50%)',
              background: '#052e16', border: '2px solid #4ade80', color: '#4ade80',
              boxShadow: '0 0 0 3px #080b12, 0 0 10px #4ade8040',
            }}
          >B</div>
        </motion.div>

        {/* Scenario marker */}
        <motion.div
          className="absolute"
          style={{ top: 9, zIndex: 11 }}
          animate={{ left: `${scenarioRisk * 100}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        >
          <div
            className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-extrabold"
            style={{
              transform: 'translateX(-50%)',
              background: '#450a0a', border: '2px solid #f87171', color: '#f87171',
              boxShadow: '0 0 0 3px #080b12, 0 0 10px #f8717140',
            }}
          >S</div>
        </motion.div>

        {/* Zone labels */}
        <div className="absolute bottom-0 left-0 right-0">
          {RISK_ZONES.map(z => (
            <span
              key={z.label}
              className="absolute text-[8px] font-bold tracking-wide uppercase"
              style={{
                left: `${((z.min + z.max) / 2) * 100}%`,
                transform: 'translateX(-50%)',
                color: z.color,
              }}
            >
              {z.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
