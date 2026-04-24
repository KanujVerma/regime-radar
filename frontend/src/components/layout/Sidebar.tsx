import { NavLink } from 'react-router-dom'
import { Activity, Clock, Archive, BarChart2, Sliders } from 'lucide-react'
import HelpDrawer from '../ui/HelpDrawer'

const NAV = [
  {
    group: 'Monitor',
    items: [
      { to: '/', label: 'Current State', icon: Activity },
      { to: '/history', label: 'History', icon: Clock },
      { to: '/event-replay', label: 'Event Replay', icon: Archive },
    ],
  },
  {
    group: 'Explore',
    items: [
      { to: '/model-drivers', label: 'Model Drivers', icon: BarChart2 },
      { to: '/scenario', label: 'Scenario Explorer', icon: Sliders },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside
      className="fixed top-0 left-0 h-full flex flex-col"
      style={{ width: 196, background: '#0a0d16', borderRight: '1px solid #151d2e' }}
    >
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="w-2 h-2 rounded-full bg-cyan-400" />
        <div>
          <div className="text-sm font-bold text-slate-100 tracking-tight">RegimeRadar</div>
          <div className="text-[9px] text-slate-500 tracking-widest uppercase">Market Monitor</div>
        </div>
      </div>

      <nav className="flex-1 px-3 mt-2">
        {NAV.map(({ group, items }) => (
          <div key={group} className="mb-4">
            <div className="px-2 mb-1 text-[9px] font-bold tracking-widest uppercase text-slate-600">{group}</div>
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-2.5 px-3 py-2 rounded-md mb-0.5 text-[11px] font-medium transition-colors',
                    isActive
                      ? 'text-cyan-400 border-l-2 border-cyan-400 pl-[10px]'
                      : 'text-slate-400 hover:text-slate-200',
                  ].join(' ')
                }
                style={({ isActive }) =>
                  isActive
                    ? { background: 'linear-gradient(90deg, #061d2e, #070f1c)' }
                    : {}
                }
              >
                <Icon size={13} />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-slate-800 space-y-3">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[9px] font-bold tracking-widest uppercase text-slate-500">Near-live data</span>
        </div>
        <HelpDrawer />
      </div>
    </aside>
  )
}
