export const colors = {
  bg: '#080b12',
  surface: '#0c1020',
  sidebar: '#0a0d16',
  border: '#151d2e',
  borderSubtle: '#131b2a',
  cyan: '#06b6d4',
  cyanDim: '#0e4d6e',
  green: '#4ade80',
  greenDim: '#166534',
  amber: '#fbbf24',
  amberDim: '#92400e',
  red: '#f87171',
  redDim: '#7f1d1d',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  textDim: '#4a6080',
} as const

export const regimeColor: Record<string, string> = {
  calm: colors.green,
  elevated: colors.amber,
  turbulent: colors.red,
  unknown: colors.textMuted,
}
