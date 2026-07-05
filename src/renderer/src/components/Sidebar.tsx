import { useState, useEffect, useCallback } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import ImportModal from './ImportModal'

interface ModelStatus {
  role: string
  model: string
  available: boolean
}

export default function Sidebar(): JSX.Element {
  const navigate = useNavigate()
  const [showImport, setShowImport] = useState(false)
  const [modelStatus, setModelStatus] = useState<ModelStatus[]>([])
  const [ollamaOk, setOllamaOk] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const status = await window.api.models.status()
      setModelStatus(status)
      setOllamaOk(status.length > 0)
    } catch {
      setOllamaOk(false)
    }
  }, [])

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 15000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  const navClass = ({ isActive }: { isActive: boolean }): string =>
    isActive
      ? 'flex items-center gap-3 px-3 py-2 bg-secondary-container text-primary font-bold rounded-lg cursor-pointer transition-all duration-200'
      : 'flex items-center gap-3 px-3 py-2 text-secondary hover:bg-surface-container-low transition-all duration-200 cursor-pointer rounded-lg'

  const iconFill = (active: boolean): React.CSSProperties =>
    active ? { fontVariationSettings: "'FILL' 1" } : {}

  return (
    <>
      <aside className="w-[260px] h-screen sticky left-0 top-0 flex flex-col bg-surface border-r border-outline-variant p-4 gap-stack-gap z-20 no-drag">
        {/* Title - drag region */}
        <div className="flex flex-col gap-1 mb-2 pt-8 drag-region">
          <span className="text-2xl font-bold text-primary tracking-wider no-drag">Daily Speaking</span>
          <span className="text-on-surface-variant text-xs font-medium opacity-60 uppercase tracking-widest no-drag">
            Shadowing Workspace
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 flex-grow">
          <NavLink to="/dashboard" className={navClass}>
            {({ isActive }) => (
              <>
                <span className="material-symbols-outlined" style={iconFill(isActive)}>dashboard</span>
                <span>Dashboard</span>
              </>
            )}
          </NavLink>

          <NavLink to="/sessions" className={navClass}>
            {({ isActive }) => (
              <>
                <span className="material-symbols-outlined" style={iconFill(isActive)}>school</span>
                <span>Sessions</span>
              </>
            )}
          </NavLink>

          <NavLink to="/flashcards" className={navClass}>
            {({ isActive }) => (
              <>
                <span className="material-symbols-outlined" style={iconFill(isActive)}>style</span>
                <span>Flashcards</span>
              </>
            )}
          </NavLink>

          <NavLink to="/exam-history" className={navClass}>
            {({ isActive }) => (
              <>
                <span className="material-symbols-outlined" style={iconFill(isActive)}>history_edu</span>
                <span>Exam History</span>
              </>
            )}
          </NavLink>

          <NavLink to="/grammar" className={navClass}>
            {({ isActive }) => (
              <>
                <span className="material-symbols-outlined" style={iconFill(isActive)}>library_books</span>
                <span>Grammar Library</span>
              </>
            )}
          </NavLink>

          <NavLink to="/settings" className={navClass}>
            {({ isActive }) => (
              <>
                <span className="material-symbols-outlined" style={iconFill(isActive)}>settings</span>
                <span>Settings</span>
              </>
            )}
          </NavLink>
        </nav>

        {/* New Session Button */}
        <button
          className="bg-primary text-on-primary py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all"
          onClick={() => setShowImport(true)}
        >
          <span className="material-symbols-outlined">add</span>
          New Session
        </button>

        {/* Model Status */}
        <div className="mt-auto pt-4 border-t border-outline-variant flex flex-col gap-2">
          <div className="flex items-center gap-3 px-3 py-2 text-on-surface-variant">
            <div
              className={`w-2 h-2 rounded-full ${ollamaOk ? 'bg-tertiary' : 'bg-error'} animate-status`}
            />
            <span className="font-ipa-label text-ipa-label">
              {ollamaOk ? 'Ollama: Ready' : 'Ollama: Offline'}
            </span>
            <span className="material-symbols-outlined text-[16px] ml-auto">memory</span>
          </div>
          {modelStatus.filter((m) => !m.available).length > 0 && (
            <div className="px-3 text-[11px] text-error opacity-80">
              {modelStatus.filter((m) => !m.available).length} model(s) missing
            </div>
          )}
        </div>
      </aside>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={(sessionId) => {
            setShowImport(false)
            navigate(`/practice/${sessionId}`)
          }}
        />
      )}
    </>
  )
}
