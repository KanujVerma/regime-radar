import type { ReactNode, CSSProperties } from 'react'
import { colors } from '../../lib/tokens'

const HEIGHT = { compact: 160, standard: 240, tall: 320 } as const

export interface ChartShellProps {
  title?: string
  height?: keyof typeof HEIGHT
  regimeGlowColor?: string
  headerRight?: ReactNode
  style?: CSSProperties
  children: ReactNode
}

export default function ChartShell({
  title,
  height = 'standard',
  regimeGlowColor,
  headerRight,
  style,
  children,
}: ChartShellProps) {
  return (
    <div style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      position: 'relative',
      ...style,
    }}>
      {regimeGlowColor && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${regimeGlowColor}, transparent)`,
        }} />
      )}
      {(title || headerRight) && (
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px 8px',
          borderBottom: `1px solid ${colors.border}`,
        }}>
          {title && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: colors.textMuted }}>
              {title}
            </span>
          )}
          {headerRight && <div style={{ position: 'relative', zIndex: 1 }}>{headerRight}</div>}
        </div>
      )}
      <div style={{ height: HEIGHT[height], position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}
