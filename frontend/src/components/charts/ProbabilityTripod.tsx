import { motion } from 'framer-motion'

interface ProbabilityTripodProps {
  baselineCalm: number
  baselineElevated: number
  baselineTurbulent: number
  scenarioCalm: number
  scenarioElevated: number
  scenarioTurbulent: number
}

const TILES = [
  {
    key: 'calm' as const,
    label: 'Calm',
    color: '#4ade80',
    bg: '#071410',
    defaultBorder: '#0e2e20',
  },
  {
    key: 'elevated' as const,
    label: 'Elevated',
    color: '#fbbf24',
    bg: '#130f02',
    defaultBorder: '#78350f',
  },
  {
    key: 'turbulent' as const,
    label: 'Turbulent',
    color: '#f87171',
    bg: '#0e0505',
    defaultBorder: '#2d0e0e',
  },
]

export default function ProbabilityTripod({
  baselineCalm, baselineElevated, baselineTurbulent,
  scenarioCalm, scenarioElevated, scenarioTurbulent,
}: ProbabilityTripodProps) {
  const scenarioValues = { calm: scenarioCalm, elevated: scenarioElevated, turbulent: scenarioTurbulent }
  const baselineValues = { calm: baselineCalm, elevated: baselineElevated, turbulent: baselineTurbulent }

  const dominant = scenarioCalm >= scenarioElevated && scenarioCalm >= scenarioTurbulent
    ? 'calm'
    : scenarioElevated >= scenarioTurbulent
    ? 'elevated'
    : 'turbulent'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      {TILES.map(tile => {
        const scenVal = scenarioValues[tile.key]
        const baseVal = baselineValues[tile.key]
        const isDominant = dominant === tile.key
        const deltaPp = (scenVal - baseVal) * 100
        const deltaLabel = Math.abs(deltaPp) < 0.5
          ? 'no change'
          : `${deltaPp > 0 ? '+' : ''}${deltaPp.toFixed(0)}pp`
        const scenarioPct = (scenVal * 100).toFixed(1) + '%'

        return (
          <div
            key={tile.key}
            style={{
              background: tile.bg,
              border: isDominant ? `1.5px solid ${tile.color}` : `1px solid ${tile.defaultBorder}`,
              borderRadius: 8,
              padding: '12px 10px',
              position: 'relative',
            }}
          >
            {isDominant && (
              <div
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 8,
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: tile.color,
                  background: tile.bg,
                  padding: '1px 5px',
                  borderRadius: 8,
                  border: `1px solid ${tile.defaultBorder}`,
                }}
              >
                dominant
              </div>
            )}

            <div
              style={{
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: tile.color,
                opacity: 0.7,
                marginBottom: 6,
              }}
            >
              {tile.label}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: tile.color, opacity: 0.4 }}>
                {(baseVal * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: 9, color: '#1e293b' }}>→</span>
              <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color: tile.color }}>
                {(scenVal * 100).toFixed(0)}%
              </span>
            </div>

            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                marginTop: 4,
                color: deltaLabel === 'no change' ? '#64748b' : deltaPp > 0 ? tile.color : '#4ade80',
              }}
            >
              {deltaLabel}
            </div>

            <div
              style={{
                height: 4,
                background: '#080b12',
                borderRadius: 2,
                marginTop: 8,
                overflow: 'hidden',
              }}
            >
              <motion.div
                animate={{ width: scenarioPct }}
                initial={{ width: '0%' }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                style={{ height: '100%', borderRadius: 2, background: tile.color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
