import { NavLink } from 'react-router-dom'
import { Activity, Clock, Archive, BarChart2, Sliders } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/',              label: 'Current',  icon: Activity,  end: true },
  { to: '/history',       label: 'History',  icon: Clock },
  { to: '/event-replay',  label: 'Events',   icon: Archive },
  { to: '/model-drivers', label: 'Signals',  icon: BarChart2 },
  { to: '/scenario',      label: 'Scenario', icon: Sliders },
]

export default function BottomNav() {
  return (
    <nav
      aria-label="Primary navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
      style={{
        minHeight: 60,
        background: '#0a0d16',
        borderTop: '1px solid #151d2e',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className="flex-1 no-underline"
          style={{ textDecoration: 'none' }}
        >
          {({ isActive }) => (
            <div
              className="flex flex-col items-center justify-center h-full gap-0.5"
              style={{ position: 'relative' }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: '25%',
                  right: '25%',
                  height: 2,
                  background: '#06b6d4',
                  borderRadius: '0 0 2px 2px',
                }} />
              )}
              <Icon
                size={20}
                strokeWidth={isActive ? 2.5 : 2}
                style={{ color: isActive ? '#f1f5f9' : '#4a6080' }}
              />
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: '.06em',
                color: isActive ? '#f1f5f9' : '#4a6080',
              }}>
                {label}
              </span>
            </div>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
