import { ReferenceArea } from 'recharts'
import { regimeGlow } from '../../lib/tokens'

interface Band { start: string; end: string; regime: string }

export default function RegimeBands({ bands }: { bands: Band[] }) {
  return (
    <>
      {bands.map((b, i) => (
        <ReferenceArea
          key={i}
          x1={b.start}
          x2={b.end}
          fill={regimeGlow[b.regime] ?? 'transparent'}
          strokeOpacity={0}
        />
      ))}
    </>
  )
}
