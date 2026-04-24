import { useState, useRef, useEffect } from 'react'

const TERMS = [
  {
    term: 'Market Regime',
    def: 'Current broad stress state — Calm, Elevated, or Turbulent. Describes where conditions stand right now.',
  },
  {
    term: 'Transition Risk',
    def: 'Estimated probability that conditions worsen within the next week. Low risk means the current regime is likely to hold.',
  },
  {
    term: 'Watch Threshold',
    def: 'Lower alert level. When risk crosses here, conditions are worth monitoring closely.',
  },
  {
    term: 'Alert Threshold',
    def: 'Higher alert level. When risk exceeds this, the model sees conditions as seriously stressed.',
  },
]

export default function HelpDrawer() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-[9px] font-bold tracking-widest uppercase"
        style={{ color: open ? '#06b6d4' : '#4a6080' }}
      >
        <span
          className="flex items-center justify-center rounded-full"
          style={{
            width: 14, height: 14, fontSize: 9, lineHeight: 1,
            border: `1px solid ${open ? '#06b6d4' : '#4a6080'}`,
            color: open ? '#06b6d4' : '#4a6080',
          }}
        >
          ?
        </span>
        How to read this
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 10px)',
            left: 0,
            width: 220,
            background: '#0c1020',
            border: '1px solid #1e2a3a',
            borderRadius: 8,
            padding: '12px 14px',
            zIndex: 50,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div className="text-[9px] font-bold tracking-widest uppercase mb-3" style={{ color: '#4a6080' }}>
            Key terms
          </div>
          <div className="space-y-3">
            {TERMS.map(({ term, def }) => (
              <div key={term}>
                <div className="text-[10px] font-semibold mb-0.5" style={{ color: '#94a3b8' }}>{term}</div>
                <p className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>{def}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
