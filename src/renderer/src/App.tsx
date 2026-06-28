import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Sessions from './pages/Sessions'
import Practice from './pages/Practice'
import Flashcards from './pages/Flashcards'
import Grammar from './pages/Grammar'
import Settings from './pages/Settings'

const APP_VERSION = '0.0.11'

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <div className="flex h-screen overflow-hidden bg-surface text-on-surface relative">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/practice/:sessionId" element={<Practice />} />
            <Route path="/flashcards" element={<Flashcards />} />
            <Route path="/grammar" element={<Grammar />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <div className="fixed bottom-2 right-3 text-[10px] font-ipa-label text-on-surface-variant opacity-40 select-none pointer-events-none z-50">
          v{APP_VERSION}
        </div>
      </div>
    </HashRouter>
  )
}
