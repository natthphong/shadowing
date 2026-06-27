import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DashboardStats } from '../types'

export default function Dashboard(): JSX.Element {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const data = await window.api.dashboard.stats()
      setStats(data as DashboardStats)
      setLoading(false)
    })()
  }, [])

  const scoreColor = (score: number): string => {
    if (score >= 85) return 'text-tertiary'
    if (score >= 65) return 'text-[#f59e0b]'
    return 'text-error'
  }

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="material-symbols-outlined text-4xl text-secondary animate-spin">refresh</span>
      </div>
    )
  }

  const StatCard = ({
    icon, label, value, sub, color = 'primary'
  }: {
    icon: string
    label: string
    value: string | number
    sub?: string
    color?: string
  }): JSX.Element => (
    <div className="p-5 bg-white rounded-2xl border border-outline-variant flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className={`material-symbols-outlined text-${color}`}
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
        <span className="text-sm text-secondary font-medium">{label}</span>
      </div>
      <span className="text-3xl font-bold text-on-surface">{value}</span>
      {sub && <span className="text-xs text-on-surface-variant">{sub}</span>}
    </div>
  )

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="w-full h-16 flex items-center px-gutter bg-surface-container-lowest border-b border-outline-variant drag-region">
        <h1 className="text-xl font-bold text-on-surface no-drag">Dashboard</h1>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar p-gutter">
        <div className="max-w-5xl flex flex-col gap-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon="school" label="Sessions" value={stats.totalSessions} />
            <StatCard icon="format_list_numbered" label="Sentences" value={stats.totalSegments} sub="practiced" />
            <StatCard
              icon="grade"
              label="Avg Score"
              value={`${stats.avgScore}%`}
              color={stats.avgScore >= 75 ? 'tertiary' : stats.avgScore >= 60 ? '[#f59e0b]' : 'error'}
            />
            <StatCard icon="style" label="Due Cards" value={stats.dueFlashcards} sub={`of ${stats.totalFlashcards}`} color="tertiary" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <StatCard icon="translate" label="Vocabulary" value={stats.totalVocab} sub="words collected" color="secondary" />
            <StatCard icon="library_books" label="Grammar Topics" value={stats.totalGrammar} color="secondary" />
          </div>

          {/* Score trend */}
          {stats.scoreByDay.length > 0 && (
            <div className="p-5 bg-white rounded-2xl border border-outline-variant">
              <h3 className="font-bold text-on-surface mb-4">Score Trend (14 days)</h3>
              <div className="flex items-end gap-2 h-24">
                {stats.scoreByDay.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-t-md transition-all ${
                        d.avg_score >= 75 ? 'bg-tertiary' : d.avg_score >= 60 ? 'bg-[#f59e0b]' : 'bg-error'
                      }`}
                      style={{ height: `${(d.avg_score / 100) * 80}px` }}
                      title={`${d.day}: ${Math.round(d.avg_score)}%`}
                    />
                    <span className="text-[8px] text-secondary">{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Sessions */}
          {stats.recentSessions.length > 0 && (
            <div className="p-5 bg-white rounded-2xl border border-outline-variant">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-on-surface">Recent Sessions</h3>
                <button
                  onClick={() => navigate('/sessions')}
                  className="text-sm text-primary font-semibold hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {stats.recentSessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/practice/${s.id}`)}
                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-surface-container-low cursor-pointer transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-on-surface text-sm truncate">{s.title}</p>
                      <p className="text-xs text-secondary">{formatDate(s.created_at)} · {s.total_segments || 0} sentences</p>
                    </div>
                    {s.avg_score != null && (
                      <span className={`font-bold text-sm ${scoreColor(s.avg_score)}`}>
                        {Math.round(s.avg_score)}%
                      </span>
                    )}
                    <div className="w-16 h-1.5 bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${s.completion_percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top missed words */}
          {stats.topMissedWords.length > 0 && (
            <div className="p-5 bg-white rounded-2xl border border-outline-variant">
              <h3 className="font-bold text-on-surface mb-4">Words to Practice</h3>
              <div className="flex flex-wrap gap-2">
                {stats.topMissedWords.map((w, i) => (
                  <span key={i} className="px-3 py-1.5 bg-error-container text-on-error-container rounded-full text-sm font-semibold">
                    {w.word}
                  </span>
                ))}
              </div>
            </div>
          )}

          {stats.totalSessions === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-secondary">
              <span className="material-symbols-outlined text-6xl opacity-30">dashboard</span>
              <p className="text-lg font-semibold">No data yet</p>
              <p className="text-sm opacity-60">Create your first session to see stats here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
