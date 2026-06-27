import { useState, useEffect, useCallback } from 'react'
import { Flashcard } from '../types'

type Rating = 'very_easy' | 'easy' | 'hard' | 'very_hard'

export default function Flashcards(): JSX.Element {
  const [dueCards, setDueCards] = useState<Flashcard[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [stats, setStats] = useState<{ total: number; due: number; byType: { type: string; c: number }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionDone, setSessionDone] = useState(false)
  const [recording, setRecording] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [cards, s] = await Promise.all([window.api.flashcards.due(), window.api.flashcards.stats()])
    setDueCards(cards as Flashcard[])
    setStats(s as { total: number; due: number; byType: { type: string; c: number }[] })
    setCurrentIdx(0)
    setFlipped(false)
    setSessionDone(false)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleRating = useCallback(async (rating: Rating) => {
    const card = dueCards[currentIdx]
    if (!card) return
    await window.api.flashcards.review(card.id, rating)

    if (currentIdx >= dueCards.length - 1) {
      setSessionDone(true)
    } else {
      setCurrentIdx((i) => i + 1)
      setFlipped(false)
    }
  }, [dueCards, currentIdx])

  const ratingLabels: { rating: Rating; label: string; color: string }[] = [
    { rating: 'very_hard', label: 'Very Hard', color: 'bg-error text-on-error' },
    { rating: 'hard', label: 'Hard', color: 'bg-[#f59e0b] text-white' },
    { rating: 'easy', label: 'Easy', color: 'bg-tertiary text-on-tertiary' },
    { rating: 'very_easy', label: 'Very Easy', color: 'bg-primary text-on-primary' }
  ]

  const typeIcon = (type: string): string => {
    const icons: Record<string, string> = {
      sentence_speaking: 'record_voice_over',
      vocabulary: 'translate',
      pronunciation: 'spatial_audio_off',
      grammar: 'library_books'
    }
    return icons[type] || 'style'
  }

  const current = dueCards[currentIdx]

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="w-full h-16 flex items-center justify-between px-gutter bg-surface-container-lowest border-b border-outline-variant drag-region">
        <h1 className="text-xl font-bold text-on-surface no-drag">Flashcards</h1>
        <div className="flex items-center gap-3 no-drag">
          {stats && (
            <span className="text-sm text-secondary">
              {stats.due} due · {stats.total} total
            </span>
          )}
          <button onClick={load} className="text-secondary hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar p-gutter flex flex-col items-center">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="material-symbols-outlined text-4xl text-secondary animate-spin">refresh</span>
          </div>
        ) : sessionDone ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <span className="material-symbols-outlined text-6xl text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <h2 className="text-2xl font-bold text-on-surface">Session Complete!</h2>
            <p className="text-secondary">You reviewed {dueCards.length} cards</p>
            <button
              onClick={load}
              className="px-8 py-3 bg-primary text-on-primary rounded-xl font-bold hover:opacity-90 transition-all"
            >
              Review Again
            </button>
          </div>
        ) : dueCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-secondary">
            <span className="material-symbols-outlined text-6xl opacity-30" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <p className="text-lg font-semibold">All caught up!</p>
            <p className="text-sm opacity-60">No cards due for review right now</p>
            {stats && (
              <div className="mt-4 flex gap-4">
                {stats.byType.map((t) => (
                  <div key={t.type} className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-outline-variant">
                    <span className="material-symbols-outlined text-primary text-sm">{typeIcon(t.type)}</span>
                    <span className="text-sm text-on-surface">{t.c} {t.type.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-lg flex flex-col items-center gap-6 py-8">
            {/* Progress */}
            <div className="w-full flex justify-between items-center text-sm text-secondary">
              <span>{currentIdx + 1} / {dueCards.length}</span>
              <span className="capitalize flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">{typeIcon(current.type)}</span>
                {current.type.replace('_', ' ')}
              </span>
            </div>
            <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${((currentIdx) / dueCards.length) * 100}%` }}
              />
            </div>

            {/* Card */}
            <div
              onClick={() => setFlipped((v) => !v)}
              className="w-full min-h-[280px] bg-white rounded-3xl border border-outline-variant shadow-sm cursor-pointer hover:shadow-md transition-all flex flex-col"
            >
              {!flipped ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
                  <span className="text-label-sm text-secondary uppercase tracking-wider">Front</span>
                  <p className="text-2xl font-medium text-on-surface text-center leading-relaxed">{current.front}</p>
                  <div className="mt-4 flex items-center gap-2 text-secondary text-sm opacity-60">
                    <span className="material-symbols-outlined text-sm">touch_app</span>
                    <span>Tap to reveal answer</span>
                  </div>
                  {current.type === 'sentence_speaking' && (
                    <div className="mt-2 text-xs text-on-surface-variant text-center">
                      Try to speak this in English from memory
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col p-6 gap-4">
                  <div className="flex-1 flex flex-col gap-3">
                    <span className="text-label-sm text-secondary uppercase tracking-wider">Answer</span>
                    <p className="text-lg font-semibold text-on-surface">{current.back}</p>
                    {current.front !== current.back && (
                      <p className="text-sm text-on-surface-variant border-t border-outline-variant pt-3">{current.front}</p>
                    )}
                  </div>

                  {/* Rating buttons */}
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    {ratingLabels.map(({ rating, label, color }) => (
                      <button
                        key={rating}
                        onClick={(e) => {
                          e.stopPropagation()
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

            {!flipped && (
              <button
                onClick={() => setFlipped(true)}
                className="px-8 py-3 bg-primary text-on-primary rounded-xl font-bold hover:opacity-90 active:scale-95 transition-all"
              >
                Show Answer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
