import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import AppShell from './components/layout/AppShell'
import CurrentState from './pages/CurrentState'
import History from './pages/History'
import EventReplay from './pages/EventReplay'
import ModelDrivers from './pages/ModelDrivers'
import ScenarioExplorer from './pages/ScenarioExplorer'

export default function App() {
  return (
    <BrowserRouter>
      <AnimatePresence mode="wait">
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<CurrentState />} />
            <Route path="history" element={<History />} />
            <Route path="event-replay" element={<EventReplay />} />
            <Route path="model-drivers" element={<ModelDrivers />} />
            <Route path="scenario" element={<ScenarioExplorer />} />
          </Route>
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  )
}
