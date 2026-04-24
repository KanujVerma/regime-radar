import type { ReactNode } from 'react'

interface PanelProps {
  title?: string
  children: ReactNode
  className?: string
}

export default function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{ background: '#0c1020', border: '1px solid #151d2e' }}
    >
      {title && (
        <div
          className="text-[9px] font-bold tracking-widest uppercase mb-4 pb-2.5"
          style={{ color: '#2d4060', borderBottom: '1px solid #131b2a' }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  )
}
