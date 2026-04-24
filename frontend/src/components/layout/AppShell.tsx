import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppShell() {
  return (
    <div className="min-h-screen" style={{ background: '#080b12' }}>
      <Sidebar />
      <main style={{ marginLeft: 196, minHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  )
}
