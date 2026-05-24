import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function AppShell() {
  return (
    <div className="min-h-screen" style={{ background: '#080b12' }}>
      <Sidebar />
      <BottomNav />
      <main className="lg:ml-[196px] ml-0 pb-[60px] lg:pb-0 min-h-screen overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
