import type { ReactNode } from 'react'

interface TopbarProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export default function Topbar({ title, subtitle, action }: TopbarProps) {
  return (
    <div
      className="flex items-center justify-between px-6"
      style={{ height: 48, borderBottom: '1px solid #151d2e', background: '#080b12' }}
    >
      <div>
        <div className="text-[17px] font-bold text-slate-100 leading-tight">{title}</div>
        {subtitle && <div className="text-[10px] text-slate-500">{subtitle}</div>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
