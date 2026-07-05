import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExamHistoryEntry } from '../types'

export default function ExamHistory(): JSX.Element {
  const navigate = useNavigate()
  const [history, setHistory] = useState<ExamHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    ;(async () => {
      setHistory(await window.api.exam.history())
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized ? history.filter((item) => `${item.session_title} ${item.quiz_title}`.toLowerCase().includes(normalized)) : history
  }, [history, query])

  const average = history.length > 0
    ? Math.round(history.reduce((sum, item) => sum + item.score, 0) / history.length)
    : 0

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="h-16 shrink-0 px-gutter flex items-center justify-between bg-white border-b border-outline-variant drag-region">
        <h1 className="text-xl font-bold no-drag">Exam History</h1>
        <div className="no-drag text-sm text-secondary">{history.length} attempts · {average}% average</div>
      </header>
      <main className="flex-1 overflow-y-auto no-scrollbar p-gutter">
        <div className="max-w-5xl flex flex-col gap-5">
          <label className="max-w-xl flex items-center gap-2 px-4 py-2.5 bg-white border border-outline-variant rounded-xl focus-within:border-primary">
            <span className="material-symbols-outlined text-secondary">search</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search session exams" className="w-full bg-transparent outline-none text-sm" />
          </label>

          {loading ? (
            <div className="py-24 text-center"><span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span></div>
          ) : filtered.length === 0 ? (
            <div className="py-24 flex flex-col items-center gap-4 text-secondary">
              <span className="material-symbols-outlined text-6xl opacity-30">history_edu</span>
              <p className="text-lg font-semibold">No exam attempts yet</p>
              <p className="text-sm">Complete a session, generate an AI exam, and submit it to build your history.</p>
              <button onClick={() => navigate('/sessions')} className="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-bold">Go to Sessions</button>
            </div>
          ) : (
            <div className="grid gap-4">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  data-testid={`exam-history-${item.id}`}
                  onClick={() => navigate(`/exam/${item.session_id}?attempt=${item.id}`)}
                  className="p-5 rounded-2xl bg-white border border-outline-variant hover:border-primary/40 hover:shadow-sm text-left flex items-center gap-5 transition-all"
                >
                  <span className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 ${item.score >= 80 ? 'bg-tertiary-container/20 text-tertiary' : item.score >= 60 ? 'bg-primary-fixed text-primary' : 'bg-error-container text-error'}`}>
                    {item.score}%
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-on-surface truncate">{item.session_title}</span>
                    <span className="block text-sm text-secondary mt-1 truncate">{item.quiz_title} · {item.correct_count}/{item.total_questions} correct</span>
                    <span className="mt-3 flex flex-wrap gap-1.5">
                      {item.tags.map((tag) => <span key={tag} className="px-2 py-0.5 rounded-full bg-surface-container text-[10px] font-semibold text-secondary">{tag}</span>)}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-xs text-secondary">{new Date(item.completed_at).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</span>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary">Review answers <span className="material-symbols-outlined text-[16px]">chevron_right</span></span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
