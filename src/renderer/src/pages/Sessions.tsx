import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Session } from '../types'

export default function Sessions(): JSX.Element {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  const load = async (): Promise<void> => {
    setLoading(true)
    const data = await window.api.sessions.list()
    setSessions(data as Session[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const deleteSession = async (id: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!confirm('Delete this session?')) return
    await window.api.sessions.delete(id)
    void load()
  }

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

  const sourceIcon = (type?: string): string => {
    if (type === 'youtube') return 'smart_display'
    if (type === 'transcript') return 'article'
    return 'audio_file'
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="w-full h-16 flex items-center px-gutter bg-surface-container-lowest border-b border-outline-variant drag-region">
        <h1 className="text-xl font-bold text-on-surface no-drag">Sessions</h1>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar p-gutter">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="material-symbols-outlined text-4xl text-secondary animate-spin">refresh</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-secondary">
            <span className="material-symbols-outlined text-6xl opacity-30">school</span>
            <p className="text-lg">No sessions yet</p>
            <p className="text-sm opacity-60">Click "New Session" to import content</p>
          </div>
        ) : (
          <div className="grid gap-4 max-w-4xl">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => navigate(`/practice/${session.id}`)}
                className="p-5 bg-white rounded-2xl border border-outline-variant hover:border-primary/40 hover:shadow-sm cursor-pointer transition-all flex gap-5 items-start group"
              >
                {/* Thumbnail / icon */}
                <div className="w-16 h-16 rounded-xl bg-primary-fixed flex items-center justify-center shrink-0 overflow-hidden">
                  {session.thumbnail ? (
                    <img src={session.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {sourceIcon(session.source_type)}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-bold text-on-surface truncate">{session.title}</h3>
                    <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => deleteSession(session.id, e)}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-error-container text-secondary hover:text-error transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-secondary mt-1">{formatDate(session.created_at)}</p>

                  {/* Progress */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-on-surface-variant mb-1">
                      <span>{session.total_segments || 0} sentences</span>
                      <span>{Math.round(session.completion_percentage)}% complete</span>
                    </div>
                    <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${session.completion_percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
