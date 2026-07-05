import { useCallback, useEffect, useMemo, useState } from 'react'
import { Flashcard } from '../types'

type Rating = 'very_easy' | 'easy' | 'hard' | 'very_hard'
type ViewMode = 'due' | 'all'

const ratingLabels: { rating: Rating; label: string; color: string }[] = [
  { rating: 'very_hard', label: 'Very Hard', color: 'bg-error text-on-error' },
  { rating: 'hard', label: 'Hard', color: 'bg-[#f59e0b] text-white' },
  { rating: 'easy', label: 'Easy', color: 'bg-tertiary text-on-tertiary' },
  { rating: 'very_easy', label: 'Very Easy', color: 'bg-primary text-on-primary' }
]

function typeIcon(type: string): string {
  const icons: Record<string, string> = {
    sentence_speaking: 'record_voice_over',
    vocabulary: 'translate',
    pronunciation: 'spatial_audio_off',
    grammar: 'library_books'
  }
  return icons[type] || 'style'
}

export default function Flashcards(): JSX.Element {
  const [viewMode, setViewMode] = useState<ViewMode>('due')
  const [cards, setCards] = useState<Flashcard[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [stats, setStats] = useState<{ total: number; due: number; byType: { type: string; c: number }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionDone, setSessionDone] = useState(false)

  const load = useCallback(async (mode: ViewMode) => {
    setLoading(true)
    const [loadedCards, loadedStats] = await Promise.all([
      mode === 'all' ? window.api.flashcards.list() : window.api.flashcards.due(),
      window.api.flashcards.stats()
    ])
    setCards(loadedCards as Flashcard[])
    setStats(loadedStats as { total: number; due: number; byType: { type: string; c: number }[] })
    setCurrentIdx(0)
    setFlipped(false)
    setExpandedId(null)
    setSessionDone(false)
    setLoading(false)
  }, [])

  useEffect(() => { void load(viewMode) }, [load, viewMode])

  const handleRating = useCallback(async (rating: Rating) => {
    const card = cards[currentIdx]
    if (!card) return
    await window.api.flashcards.review(card.id, rating)
    if (currentIdx >= cards.length - 1) setSessionDone(true)
    else {
      setCurrentIdx((index) => index + 1)
      setFlipped(false)
    }
  }, [cards, currentIdx])

  const filteredCards = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return cards.filter((card) => {
      const matchesType = typeFilter === 'all' || card.type === typeFilter
      const matchesQuery = !normalized || `${card.front} ${card.back}`.toLowerCase().includes(normalized)
      return matchesType && matchesQuery
    })
  }, [cards, query, typeFilter])

  const current = cards[currentIdx]

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="w-full min-h-16 flex items-center justify-between gap-4 px-gutter bg-surface-container-lowest border-b border-outline-variant drag-region">
        <div className="flex items-center gap-4 no-drag">
          <h1 className="text-xl font-bold text-on-surface">Flashcards</h1>
          <div className="flex items-center rounded-xl bg-surface-container p-1" role="tablist" aria-label="Flashcard view">
            <button
              role="tab"
              aria-selected={viewMode === 'due'}
              onClick={() => setViewMode('due')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${viewMode === 'due' ? 'bg-white text-primary shadow-sm' : 'text-secondary'}`}
            >
              Due Today {stats ? `(${stats.due})` : ''}
            </button>
            <button
              role="tab"
              aria-selected={viewMode === 'all'}
              onClick={() => setViewMode('all')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${viewMode === 'all' ? 'bg-white text-primary shadow-sm' : 'text-secondary'}`}
            >
              Show All {stats ? `(${stats.total})` : ''}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 no-drag">
          {stats && <span className="text-sm text-secondary">{stats.due} due · {stats.total} total</span>}
          <button onClick={() => void load(viewMode)} className="text-secondary hover:text-primary transition-colors" title="Refresh flashcards">
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar p-gutter">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="material-symbols-outlined text-4xl text-secondary animate-spin">refresh</span>
          </div>
        ) : viewMode === 'all' ? (
          <div className="max-w-5xl mx-auto flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <label className="flex-1 flex items-center gap-2 px-4 py-2.5 bg-white border border-outline-variant rounded-xl focus-within:border-primary">
                <span className="material-symbols-outlined text-secondary text-[18px]">search</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search fronts and answers"
                  className="w-full bg-transparent outline-none text-sm"
                />
              </label>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="px-4 py-2.5 bg-white border border-outline-variant rounded-xl text-sm outline-none"
                aria-label="Filter by card type"
              >
                <option value="all">All types</option>
                <option value="vocabulary">Vocabulary</option>
                <option value="sentence_speaking">Sentence speaking</option>
                <option value="pronunciation">Pronunciation</option>
                <option value="grammar">Grammar</option>
              </select>
            </div>

            {filteredCards.length === 0 ? (
              <div className="py-20 flex flex-col items-center gap-3 text-secondary">
                <span className="material-symbols-outlined text-5xl opacity-30">style</span>
                <p className="font-semibold">No flashcards match this view</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredCards.map((card) => {
                  const expanded = expandedId === card.id
                  return (
                    <button
                      key={card.id}
                      onClick={() => setExpandedId(expanded ? null : card.id)}
                      className="text-left p-5 bg-white rounded-2xl border border-outline-variant hover:border-primary/40 transition-colors flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wide">
                          <span className="material-symbols-outlined text-[16px]">{typeIcon(card.type)}</span>
                          {card.type.replaceAll('_', ' ')}
                        </span>
                        <span className="text-xs text-secondary">Reviewed {card.review_count} times</span>
                      </div>
                      <p className="text-lg font-semibold text-on-surface">{card.front}</p>
                      {expanded ? (
                        <div className="pt-3 border-t border-outline-variant">
                          <p className="text-sm font-semibold text-secondary mb-1">Answer</p>
                          <p className="text-on-surface-variant whitespace-pre-wrap">{card.back}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-secondary flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">visibility</span>
                          Click to show answer
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : sessionDone ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <span className="material-symbols-outlined text-6xl text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <h2 className="text-2xl font-bold text-on-surface">Review complete</h2>
            <p className="text-secondary">You reviewed {cards.length} cards due today</p>
            <div className="flex gap-3">
              <button onClick={() => void load('due')} className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold">Review Again</button>
              <button onClick={() => setViewMode('all')} className="px-6 py-3 bg-surface-container text-on-surface rounded-xl font-bold">Show All Cards</button>
            </div>
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-secondary">
            <span className="material-symbols-outlined text-6xl opacity-30" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <p className="text-lg font-semibold">All caught up!</p>
            <p className="text-sm opacity-60">No cards due for review right now</p>
            <button onClick={() => setViewMode('all')} className="mt-3 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold">Show All Cards</button>
          </div>
        ) : (
          <div className="w-full max-w-lg mx-auto flex flex-col items-center gap-6 py-8">
            <div className="w-full flex justify-between items-center text-sm text-secondary">
              <span>{currentIdx + 1} / {cards.length}</span>
              <span className="capitalize flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">{typeIcon(current.type)}</span>
                {current.type.replaceAll('_', ' ')}
              </span>
            </div>
            <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(currentIdx / cards.length) * 100}%` }} />
            </div>

            <div
              onClick={() => setFlipped((value) => !value)}
              className="w-full min-h-[280px] bg-white rounded-3xl border border-outline-variant shadow-sm cursor-pointer hover:shadow-md transition-all flex flex-col"
            >
              {!flipped ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
                  <span className="text-label-sm text-secondary uppercase tracking-wider">Front</span>
                  <p className="text-2xl font-medium text-on-surface text-center leading-relaxed">{current.front}</p>
                  <span className="text-sm text-secondary opacity-60">Tap to reveal answer</span>
                </div>
              ) : (
                <div className="flex-1 flex flex-col p-6 gap-4">
                  <div className="flex-1 flex flex-col gap-3">
                    <span className="text-label-sm text-secondary uppercase tracking-wider">Answer</span>
                    <p className="text-lg font-semibold text-on-surface">{current.back}</p>
                    {current.front !== current.back && <p className="text-sm text-on-surface-variant border-t border-outline-variant pt-3">{current.front}</p>}
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    {ratingLabels.map(({ rating, label, color }) => (
                      <button
                        key={rating}
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleRating(rating)
                        }}
                        className={`py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 ${color}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!flipped && <button onClick={() => setFlipped(true)} className="px-8 py-3 bg-primary text-on-primary rounded-xl font-bold">Show Answer</button>}
          </div>
        )}
      </div>
    </div>
  )
}
