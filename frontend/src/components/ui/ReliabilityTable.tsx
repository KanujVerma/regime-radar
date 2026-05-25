import type { ThresholdSweepRow } from '../../types/api'
import { colors } from '../../lib/tokens'

function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—'
  return `${(v * 100).toFixed(0)}%`
}

function fmtDays(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—'
  return `${v.toFixed(0)} days`
}

export default function ReliabilityTable({ rows }: { rows: ThresholdSweepRow[] }) {
  return (
    <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '12px 14px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Alert threshold', 'Shifts caught', 'Avg. days early', 'False alarm rate'].map(h => (
              <th key={h} style={{ color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', fontWeight: 600, textAlign: 'left', paddingBottom: 8, paddingRight: 8, borderBottom: `1px solid ${colors.border}` }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.threshold}>
              <td style={{ color: colors.textPrimary, fontSize: 10, padding: '5px 8px 5px 0', borderBottom: `1px solid ${colors.borderSubtle}` }}>{fmtPct(row.threshold)}</td>
              <td style={{ color: colors.textSecondary, fontSize: 10, padding: '5px 8px 5px 0', borderBottom: `1px solid ${colors.borderSubtle}` }}>{fmtPct(row.recall)}</td>
              <td style={{ color: colors.textSecondary, fontSize: 10, padding: '5px 8px 5px 0', borderBottom: `1px solid ${colors.borderSubtle}` }}>{fmtDays(row.avg_lead_time_days)}</td>
              <td style={{ color: colors.textSecondary, fontSize: 10, padding: '5px 8px 5px 0', borderBottom: `1px solid ${colors.borderSubtle}` }}>{fmtPct(row.false_alert_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: colors.textDim, fontSize: 10, marginTop: 10, lineHeight: 1.6 }}>
        <strong style={{ color: colors.textSecondary }}>How to read this:</strong> At a lower threshold, the model catches more regime shifts but also produces more false alarms. At a higher threshold, it is more selective — when it flags, it tends to be meaningful. The model is not designed to time market exits; it identifies when conditions are becoming stress-prone.
      </p>
    </div>
  )
}
