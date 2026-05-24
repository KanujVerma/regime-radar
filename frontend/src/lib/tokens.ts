export const colors = {
  bg: '#080b12',
  surface: '#0c1020',
  surfaceElevated: '#0d1525',
  sidebar: '#0a0d16',
  border: '#151d2e',
  borderSubtle: '#131b2a',
  borderElevated: '#1a2540',
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
  // Glass surfaces — Tier 1 hero panels only
  glass: 'rgba(12,16,32,0.85)',
  /** box-shadow value — use as style={{ boxShadow: colors.glassHighlight }}, not as a color */
  glassHighlight: 'inset 0 1px 0 rgba(255,255,255,0.05)',
  // Per-regime ambient glow (used as radial-gradient color, one per page)
  calmGlow: 'rgba(74,222,128,0.10)',
  elevatedGlow: 'rgba(251,191,36,0.10)',
  turbulentGlow: 'rgba(248,113,113,0.10)',
} as const

export const regimeColor: Record<string, string> = {
  calm: colors.green,
  elevated: colors.amber,
  turbulent: colors.red,
  unknown: colors.textMuted,
}

export const regimeGlow: Record<string, string> = {
  calm: colors.calmGlow,
  elevated: colors.elevatedGlow,
  turbulent: colors.turbulentGlow,
  unknown: 'transparent',
}

/** Returns an rgba border color at ~15% opacity from a hex color */
export function regimeBorder(hexColor: string): string {
  return `${hexColor}26`
}

export const typography = {
  microLabel: { fontSize: 9, letterSpacing: '0.10em', textTransform: 'uppercase' as const, color: colors.textMuted },
  sectionTitle: { fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' as const },
  statSm:  { fontSize: 22, fontWeight: 800 },
  statMd:  { fontSize: 32, fontWeight: 800 },
  statLg:  { fontSize: 40, fontWeight: 900 },
  statXl:  { fontSize: 52, fontWeight: 900 },
} as const

export const spacing = {
  pageX: '1.5rem',
  pageY: '1.25rem',
  sectionGap: '1.5rem',
  panelPad: '1.25rem',
} as const
