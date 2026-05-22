import type { ChangelogResponse, ChangelogEntry } from '../../types/api'

const REGIME_COLOR: Record<string, string> = {
  calm: '#22c55e',
  elevated: '#f59e0b',
  turbulent: '#ef4444',
}

const TRIGGER_BADGE_COLOR: Record<string, string> = {
  regime_shift:    '#f59e0b',
  risk_move:       '#ef4444',
  vix_move:        '#06b6d4',
  driver_rotation: '#64748b',
}

const STATIC_TRIGGER_LABEL: Record<string, string> = {
  regime_shift: 'REGIME SHIFT',
  driver_rotation: 'DRIVER SHIFT',
}

function badgeLabel(entry: ChangelogEntry, trigger: string): string {
  if (trigger === 'regime_shift') return STATIC_TRIGGER_LABEL['regime_shift']
  if (trigger === 'driver_rotation') return STATIC_TRIGGER_LABEL['driver_rotation']
  if (trigger === 'risk_move') {
    return 'RISK ' + (entry.risk_delta > 0 ? '+' : '') + Math.round(entry.risk_delta * 100) + 'pp'
  }
  if (trigger === 'vix_move') {
    return 'VIX ' + (entry.vix_delta != null && entry.vix_delta > 0 ? '+' : '') + (entry.vix_delta?.toFixed(1) ?? '')
  }
  return trigger.toUpperCase()
}

function regimeContext(entry: ChangelogEntry): string {
  if (entry.triggers.includes('regime_shift') && entry.prior_regime !== null) {
    return entry.prior_regime + ' → ' + entry.regime
  }
  return 'Regime: ' + entry.regime
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
}

export default function ChangelogFeed({ data }: { data: ChangelogResponse }) {
  if (data.entries.length === 0) {
    return <p style={{ color: '#64748b', fontSize: 10 }}>No notable changes in the available data.</p>
  }

  return (
    <div>
      {data.entries.map((entry, index) => (
        <div
          key={entry.current_date}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '10px 0',
            borderBottom: index < data.entries.length - 1 ? '1px solid #0f1929' : 'none',
          }}
        >
          {/* Date column */}
          <span style={{ fontSize: 9, color: '#64748b', minWidth: 48, fontFamily: 'monospace', paddingTop: 2 }}>
            {formatDate(entry.current_date)}
          </span>

          {/* Content column with left border keyed to regime */}
          <div
            style={{
              flex: 1,
              borderLeft: `2px solid ${REGIME_COLOR[entry.regime.toLowerCase()] ?? '#64748b'}`,
              paddingLeft: 10,
            }}
          >
            {/* Row 1: badges + regime context + stale-gap tag */}
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
              {entry.triggers.map(trigger => {
                const color = TRIGGER_BADGE_COLOR[trigger] ?? '#64748b'
                return (
                  <span
                    key={trigger}
                    style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                      background: color + '18', color, border: `1px solid ${color}40`,
                    }}
                  >
                    {badgeLabel(entry, trigger)}
                  </span>
                )
              })}
              <span style={{ fontSize: 9, color: '#64748b' }}>{regimeContext(entry)}</span>
              {entry.is_stale_gap && (
                <span style={{ fontSize: 9, color: '#f59e0b' }}>⚠ {entry.gap_days}d gap</span>
              )}
            </div>

            {/* Row 2: narrative */}
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              {entry.narrative}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
