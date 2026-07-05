import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Session } from '../types'

export default function Sessions(): JSX.Element {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    const data = await window.api.sessions.list() as Session[]
    const reconciled = await Promise.all(data.map(async (session) => {
      const saved = localStorage.getItem(`progress_max_${session.id}`) ?? localStorage.getItem(`progress_${session.id}`)
      const savedIndex = saved === null ? -1 : Number.parseInt(saved, 10)
      const localProgress = session.total_segments > 0 && Number.isInteger(savedIndex) && savedIndex >= 0
        ? Math.min(100, Math.round(((savedIndex + 1) / session.total_segments) * 100))
        : 0
      if (localProgress > session.completion_percentage) {
        await window.api.sessions.updateProgress(session.id, {
          completion_percentage: localProgress,
          ...(localProgress >= 100 ? { completed_at: new Date().toISOString() } : {})
        })
      }
      return { ...session, completion_percentage: Math.max(session.completion_percentage, localProgress) }
    }))
    setSessions(reconciled)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

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
            {sessions.map((session) => {
              const progress = Math.max(0, Math.min(100, session.completion_percentage || 0))
              const examCount = session.exam_attempt_count || 0
              return (
              <div
                key={session.id}
                onClick={() => navigate(`/practice/${session.id}`)}
                data-testid={`session-card-${session.id}`}
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
                    <div className="min-w-0 flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-on-surface truncate">{session.title}</h3>
                      {progress >= 100 && (
                        <span className="px-2 py-0.5 rounded-full bg-tertiary-container/20 text-tertiary text-[10px] font-bold uppercase tracking-wide">
                          {examCount > 0 ? `${examCount} exam${examCount > 1 ? 's' : ''}` : 'Exam ready'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => deleteSession(session.id, e)}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-error-container text-secondary hover:text-error transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1">
                    <p className="text-sm text-secondary">{formatDate(session.created_at)}</p>
                    {progress >= 100 && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          navigate(`/exam/${session.id}`)
                        }}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-primary-fixed text-primary text-xs font-bold hover:bg-secondary-container transition-colors"
                      >
                        <span className="material-symbols-outlined text-[15px]">quiz</span>
                        {examCount > 0 ? 'Retake / Review' : 'Take Exam'}
                      </button>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-on-surface-variant mb-1">
                      <span>{session.total_segments || 0} sentences</span>
                      <span>{Math.round(progress)}% complete</span>
                    </div>
                    <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
