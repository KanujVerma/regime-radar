import type { ReactNode } from 'react'
import { colors } from '../../lib/tokens'

interface PanelProps {
  title?: string
  children: ReactNode
  className?: string
}

export default function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <div
      className={`rounded-lg p-5 ${className}`}
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
      }}
    >
      {title && (
        <div
          className="text-[9px] font-bold tracking-widest uppercase mb-4 pb-2.5"
          style={{ color: '#4a6080', borderBottom: '1px solid #131b2a' }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  )
}
