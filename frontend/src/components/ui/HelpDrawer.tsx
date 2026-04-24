import { useState } from 'react'

const TERMS = [
  {
    term: 'Market Regime',
    def: 'The current broad stress state of the market — Calm, Elevated, or Turbulent. Based on clustering of volatility and momentum signals. It describes where conditions stand right now.',
  },
  {
    term: 'Transition Risk',
    def: 'The model\'s estimated probability that market conditions will worsen within the next week. A low number means the current regime is likely to hold, not that conditions are good.',
  },
  {
    term: 'Watch Threshold',
    def: 'The lower alert level. When transition risk crosses this line, conditions are worth monitoring closely. Fewer false alerts, but some real moves may be missed.',
  },
  {
    term: 'Alert Threshold',
    def: 'The higher alert level. When risk exceeds this, the model considers conditions seriously stressed. More decisive — but may fire earlier than the peak.',
  },
]

export default function HelpDrawer() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-[9px] font-bold tracking-widest uppercase"
        style={{ color: '#4a6080' }}
      >
        <span
          className="flex items-center justify-center rounded-full"
          style={{ width: 14, height: 14, border: '1px solid #4a6080', fontSize: 9, lineHeight: 1 }}
        >
          ?
        </span>
        How to read this
      </button>

      {open && (
        <div
          className="fixed bottom-0 left-0 z-50 overflow-y-auto"
          style={{
            width: 196,
            maxHeight: '70vh',
            background: '#0a0d16',
            border: '1px solid #151d2e',
            borderBottom: 'none',
            borderRadius: '12px 12px 0 0',
            padding: '16px 14px',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#4a6080' }}>
              How to read RegimeRadar
            </span>
            <button onClick={() => setOpen(false)} style={{ color: '#64748b', fontSize: 14, lineHeight: 1 }}>×</button>
          </div>

          <div className="space-y-4">
            {TERMS.map(({ term, def }) => (
              <div key={term}>
                <div className="text-[10px] font-bold mb-1" style={{ color: '#94a3b8' }}>{term}</div>
                <p className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>{def}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
