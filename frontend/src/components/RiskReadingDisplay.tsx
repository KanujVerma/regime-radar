import type { RiskReading } from '../types/api'
import { riskReadingView } from '../lib/riskReading'

/** Thin renderer: all logic (incl. the no-% guarantee) lives in riskReadingView. */
export function RiskReadingDisplay({ reading }: { reading: RiskReading }) {
  const v = riskReadingView(reading)
  return (
    <div className={`risk-reading risk-${v.kind}`}>
      {v.showsPercent && v.value && <span className="risk-value">{v.value}</span>}
      {v.tier && <span className="risk-tier">{v.tier}</span>}
      {v.lines.map((line, i) => (
        <div key={i} className="risk-line">{line}</div>
      ))}
    </div>
  )
}
