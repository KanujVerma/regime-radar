import { colors } from '../../lib/tokens'

interface Option {
  value: string
  label: string
}

interface SegmentedControlProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
}

export default function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div style={{
      display: 'inline-flex',
      background: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      padding: 2,
      gap: 2,
    }}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              background: active ? colors.surface : 'transparent',
              color: active ? colors.textPrimary : colors.textSecondary,
              boxShadow: active ? `0 0 0 1px ${colors.border}` : 'none',
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
