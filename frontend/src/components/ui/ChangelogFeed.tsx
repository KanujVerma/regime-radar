import type { ChangelogResponse } from '../../types/api'
import { regimeColor } from '../../lib/tokens'

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
}

export default function ChangelogFeed({ data }: { data: ChangelogResponse }) {
  if (data.entries.length === 0) {
    return <p style={{ color: '#64748b', fontSize: 10 }}>No notable changes in the available data.</p>
  }

  return (
    <div style={{ position: 'relative', paddingLeft: 20 }}>
      {/* Vertical connector line */}
      <div style={{
        position: 'absolute',
        left: 7,
        top: 8,
        bottom: 8,
        width: 1,
        background: 'linear-gradient(to bottom, #1e2940, #0f1929)',
      }} />

      {data.entries.map((entry) => {
        const color = regimeColor[entry.regime.toLowerCase()] ?? '#64748b'
        return (
          <div key={entry.current_date} style={{ display: 'flex', gap: 14, marginBottom: 18, position: 'relative' }}>
            {/* Node */}
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: `${color}20`,
              border: `2px solid ${color}`,
              flexShrink: 0,
              marginTop: 2,
              position: 'relative',
              zIndex: 1,
            }} />
            {/* Content */}
            <div style={{ flex: 1, paddingBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{formatDate(entry.current_date)}</span>
                {entry.regime && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
                    color, background: `${color}15`, border: `1px solid ${color}30`,
                    borderRadius: 4, padding: '1px 6px',
                  }}>
                    {entry.regime}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                {entry.narrative}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
