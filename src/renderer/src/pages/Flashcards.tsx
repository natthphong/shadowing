import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Flashcard, ScoreResult } from '../types'

type Rating = 'very_easy' | 'easy' | 'hard' | 'very_hard'
type ViewMode = 'due' | 'all'

const ratingLabels: { rating: Rating; label: string; color: string }[] = [
  { rating: 'very_hard', label: 'Very Hard', color: 'bg-error text-on-error' },
  { rating: 'hard', label: 'Hard', color: 'bg-[#f59e0b] text-white' },
  { rating: 'easy', label: 'Easy', color: 'bg-tertiary text-on-tertiary' },
  { rating: 'very_easy', label: 'Very Easy', color: 'bg-primary text-on-primary' }
]

const cardTypes = [
  { value: 'vocabulary', label: 'Vocabulary' },
  { value: 'sentence_speaking', label: 'Sentence speaking' },
  { value: 'pronunciation', label: 'Pronunciation' },
  { value: 'grammar', label: 'Grammar' }
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

// The side of the card that is (mostly) English — used for TTS and speaking practice
function englishSide(card: Flashcard): string {
  const latinCount = (s: string): number => (s.match(/[a-zA-Z]/g) || []).length
  return latinCount(card.front) >= latinCount(card.back) ? card.front : card.back
}

interface EditorState {
  id: string | null
  type: string
  front: string
  back: string
}

const emptyEditor: EditorState = { id: null, type: 'vocabulary', front: '', back: '' }

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

  // Manage mode (Show All)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [savingCard, setSavingCard] = useState(false)

  // TTS
  const [ttsPlaying, setTtsPlaying] = useState(false)

  // Speaking practice on the current review card
  const [isRecording, setIsRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [speakResult, setSpeakResult] = useState<{ transcript: string; scores: ScoreResult } | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingStartRef = useRef<number>(0)

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
    setSelectMode(false)
    setSelectedIds(new Set())
    setSpeakResult(null)
    setLoading(false)
  }, [])

  useEffect(() => { void load(viewMode) }, [load, viewMode])

  const handleRating = useCallback(async (rating: Rating) => {
    const card = cards[currentIdx]
    if (!card) return
    await window.api.flashcards.review(card.id, rating)
    setSpeakResult(null)
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

  // ── TTS (uses the local voice cache; generates once then replays instantly) ──
  const playTts = useCallback(async (text: string) => {
    if (!text || ttsPlaying) return
    setTtsPlaying(true)
    try {
      const result = await window.api.tts.speak(text)
      const audio = new Audio(`file://${result.path}`)
      audio.onended = () => setTtsPlaying(false)
      audio.onerror = () => setTtsPlaying(false)
      await audio.play()
    } catch (e) {
      setTtsPlaying(false)
      console.error('TTS error:', e)
    }
  }, [ttsPlaying])

  // ── Speaking practice: record → Whisper → same scoring as sessions ──────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []
      recordingStartRef.current = Date.now()
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()) }
      mr.start()
      setIsRecording(true)
      setSpeakResult(null)
    } catch (e) {
      alert('Microphone access denied: ' + String(e))
    }
  }, [])

  const stopRecording = useCallback(async () => {
    const card = cards[currentIdx]
    if (!mediaRecorderRef.current || !card) return
    mediaRecorderRef.current.stop()
    setIsRecording(false)
    await new Promise<void>((resolve) => setTimeout(resolve, 400))

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    if (blob.size === 0) { alert('Recording is empty — please try again.'); return }

    setTranscribing(true)
    try {
      const target = englishSide(card)
      const actualDuration = (Date.now() - recordingStartRef.current) / 1000
      // No source media for a card — estimate a natural duration from word count (~2.5 words/sec)
      const wordCount = target.split(/\s+/).filter(Boolean).length
      const targetDuration = Math.max(1.5, wordCount / 2.5)

      const arrayBuffer = await blob.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)
      let base64 = ''
      for (let i = 0; i < uint8.length; i += 8192) {
        base64 += String.fromCharCode(...uint8.subarray(i, i + 8192))
      }
      base64 = btoa(base64)

      const recPath = await window.api.recording.save(base64, `card_rec_${Date.now()}.webm`)
      const result = await window.api.practice.transcribeRecording(
        recPath, target, targetDuration, actualDuration
      )
      setSpeakResult({ transcript: result.userTranscript, scores: result.scores })
    } catch (e) {
      alert('Transcription error: ' + String(e))
    } finally {
      setTranscribing(false)
    }
  }, [cards, currentIdx])

  const handleRecord = useCallback(() => {
    if (transcribing) return
    if (isRecording) void stopRecording()
    else void startRecording()
  }, [isRecording, startRecording, stopRecording, transcribing])

  // ── Manage: add / edit / delete ──────────────────────────────────────────────
  const saveEditor = useCallback(async () => {
    if (!editor || !editor.front.trim() || !editor.back.trim()) return
    setSavingCard(true)
    try {
      if (editor.id) {
        await window.api.flashcards.update(editor.id, {
          type: editor.type, front: editor.front.trim(), back: editor.back.trim()
        })
      } else {
        await window.api.flashcards.create({
          type: editor.type, front: editor.front.trim(), back: editor.back.trim()
        })
      }
      setEditor(null)
      await load(viewMode)
    } finally {
      setSavingCard(false)
    }
  }, [editor, load, viewMode])

  const deleteOne = useCallback(async (cardId: string) => {
    if (!confirm('Delete this flashcard?')) return
    await window.api.flashcards.delete(cardId)
    await load(viewMode)
  }, [load, viewMode])

  const deleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} selected flashcard(s)?`)) return
    await window.api.flashcards.deleteMany(Array.from(selectedIds))
    await load(viewMode)
  }, [selectedIds, load, viewMode])

  const toggleSelected = useCallback((cardId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }, [])

  const selectAllFiltered = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === filteredCards.length ? new Set() : new Set(filteredCards.map((c) => c.id))
    )
  }, [filteredCards])

  const scoreColor = (score: number): string =>
    score >= 85 ? 'text-tertiary' : score >= 65 ? 'text-[#f59e0b]' : 'text-error'

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
          {viewMode === 'all' && (
            <>
              <button
                onClick={() => setEditor({ ...emptyEditor })}
                data-testid="add-flashcard"
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:opacity-90 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Add Card
              </button>
              <button
                onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()) }}
                aria-pressed={selectMode}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${selectMode ? 'bg-secondary-container text-primary' : 'bg-surface-container text-secondary hover:text-primary'}`}
              >
                <span className="material-symbols-outlined text-[18px]">checklist</span>
                {selectMode ? 'Cancel' : 'Select'}
              </button>
            </>
          )}
          {stats && <span className="text-sm text-secondary">{stats.due} due · {stats.total} total</span>}
          <button onClick={() => void load(viewMode)} className="text-secondary hover:text-primary transition-colors" title="Refresh flashcards">
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      </header>

      {/* Bulk-selection action bar */}
      {viewMode === 'all' && selectMode && (
        <div className="flex items-center gap-3 px-gutter py-2.5 bg-secondary-container/60 border-b border-outline-variant">
          <button onClick={selectAllFiltered} className="text-sm font-semibold text-primary hover:underline">
            {selectedIds.size === filteredCards.length && filteredCards.length > 0 ? 'Clear selection' : 'Select all'}
          </button>
          <span className="text-sm text-secondary">{selectedIds.size} selected</span>
          <button
            onClick={() => void deleteSelected()}
            disabled={selectedIds.size === 0}
            data-testid="delete-selected"
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-error text-on-error rounded-xl text-sm font-bold disabled:opacity-40 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            Delete selected
          </button>
        </div>
      )}

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
                {cardTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {filteredCards.length === 0 ? (
              <div className="py-20 flex flex-col items-center gap-3 text-secondary">
                <span className="material-symbols-outlined text-5xl opacity-30">style</span>
                <p className="font-semibold">No flashcards match this view</p>
                <button onClick={() => setEditor({ ...emptyEditor })} className="mt-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm">
                  Add your first card
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredCards.map((card) => {
                  const expanded = expandedId === card.id
                  const selected = selectedIds.has(card.id)
                  return (
                    <div
                      key={card.id}
                      onClick={() => selectMode ? toggleSelected(card.id) : setExpandedId(expanded ? null : card.id)}
                      className={`text-left p-5 bg-white rounded-2xl border transition-colors flex flex-col gap-3 cursor-pointer ${
                        selected ? 'border-primary bg-secondary-container/30' : 'border-outline-variant hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wide">
                          {selectMode && (
                            <span className={`material-symbols-outlined text-[18px] ${selected ? 'text-primary' : 'text-outline-variant'}`} style={{ fontVariationSettings: selected ? "'FILL' 1" : "'FILL' 0" }}>
                              {selected ? 'check_box' : 'check_box_outline_blank'}
                            </span>
                          )}
                          <span className="material-symbols-outlined text-[16px]">{typeIcon(card.type)}</span>
                          {card.type.replaceAll('_', ' ')}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-secondary">
                          Reviewed {card.review_count} times
                          {!selectMode && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditor({ id: card.id, type: card.type, front: card.front, back: card.back }) }}
                                title="Edit card"
                                className="ml-2 w-7 h-7 rounded-full flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-container transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); void deleteOne(card.id) }}
                                title="Delete card"
                                className="w-7 h-7 rounded-full flex items-center justify-center text-secondary hover:text-error hover:bg-error-container/20 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </>
                          )}
                        </span>
                      </div>
                      <p className="text-lg font-semibold text-on-surface">{card.front}</p>
                      {expanded && !selectMode ? (
                        <div className="pt-3 border-t border-outline-variant">
                          <p className="text-sm font-semibold text-secondary mb-1">Answer</p>
                          <p className="text-on-surface-variant whitespace-pre-wrap">{card.back}</p>
                        </div>
                      ) : !selectMode ? (
                        <span className="text-xs text-secondary flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">visibility</span>
                          Click to show answer
                        </span>
                      ) : null}
                    </div>
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

            {/* Review toolbar: AI voice + speaking practice */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => void playTts(englishSide(current))}
                disabled={ttsPlaying}
                data-testid="card-tts"
                title="AI voice (cached after first play)"
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full border-2 transition-all text-sm font-bold ${
                  ttsPlaying ? 'border-tertiary bg-tertiary-container text-tertiary animate-pulse' : 'border-outline-variant text-secondary hover:bg-surface-container'
                } disabled:opacity-60`}
              >
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {ttsPlaying ? 'volume_up' : 'record_voice_over'}
                </span>
                AI Voice
              </button>

              {isRecording ? (
                <button
                  onClick={handleRecord}
                  data-testid="card-record"
                  className="px-5 py-2.5 bg-error text-on-error rounded-full flex items-center gap-1.5 shadow-md recording-active text-sm font-bold"
                >
                  <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleRecord}
                  disabled={transcribing}
                  data-testid="card-record"
                  className="px-5 py-2.5 bg-primary text-on-primary rounded-full flex items-center gap-1.5 shadow-md hover:scale-105 active:scale-95 transition-all disabled:opacity-50 text-sm font-bold"
                >
                  <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
                  Speak
                </button>
              )}
            </div>

            {isRecording && (
              <div className="flex items-end gap-0.5 h-4">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="waveform-bar" style={{ animationDelay: `${i * 0.07}s` }} />
                ))}
              </div>
            )}
            {transcribing && (
              <div className="flex items-center gap-1.5 text-secondary text-sm">
                <span className="material-symbols-outlined animate-spin text-[16px]">refresh</span>
                Transcribing and scoring...
              </div>
            )}

            {/* Speaking practice result — same scoring as sessions */}
            {speakResult && (
              <div className="w-full p-4 bg-white rounded-2xl border border-outline-variant flex flex-col gap-2" data-testid="card-speak-result">
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold flex items-center gap-1 ${scoreColor(speakResult.scores.overall_score)}`}>
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>stars</span>
                    {speakResult.scores.overall_score}%
                  </span>
                  <div className="flex gap-3 text-xs text-secondary ml-auto">
                    <span className={scoreColor(speakResult.scores.accuracy_score)}>Acc {speakResult.scores.accuracy_score}%</span>
                    <span className={scoreColor(speakResult.scores.pronunciation_score)}>Pron {speakResult.scores.pronunciation_score}%</span>
                    <span className={scoreColor(speakResult.scores.rhythm_score)}>Rhy {speakResult.scores.rhythm_score}%</span>
                    <span className={scoreColor(speakResult.scores.speed_score)}>Spd {speakResult.scores.speed_score}%</span>
                  </div>
                </div>
                {speakResult.transcript && (
                  <p className="text-sm text-on-surface-variant">You said: &ldquo;{speakResult.transcript}&rdquo;</p>
                )}
                {speakResult.scores.feedback_text && (
                  <p className="text-xs text-secondary">{speakResult.scores.feedback_text}</p>
                )}
              </div>
            )}

            {!flipped && <button onClick={() => setFlipped(true)} className="px-8 py-3 bg-primary text-on-primary rounded-xl font-bold">Show Answer</button>}
          </div>
        )}
      </div>

      {/* Add / edit card modal */}
      {editor && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditor(null)}>
          <div className="w-[480px] max-w-[calc(100vw-2rem)] bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-on-surface">{editor.id ? 'Edit Flashcard' : 'New Flashcard'}</h2>
              <button onClick={() => setEditor(null)} className="text-secondary hover:text-primary">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-on-surface">Type</label>
              <select
                value={editor.type}
                onChange={(e) => setEditor((s) => s && { ...s, type: e.target.value })}
                className="px-4 py-2.5 rounded-xl border border-outline-variant bg-white text-sm outline-none focus:border-primary"
              >
                {cardTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-on-surface">Front</label>
              <textarea
                value={editor.front}
                onChange={(e) => setEditor((s) => s && { ...s, front: e.target.value })}
                rows={2}
                placeholder="e.g. the English sentence or word"
                className="px-4 py-2.5 rounded-xl border border-outline-variant bg-white text-sm outline-none focus:border-primary resize-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-on-surface">Back</label>
              <textarea
                value={editor.back}
                onChange={(e) => setEditor((s) => s && { ...s, back: e.target.value })}
                rows={2}
                placeholder="e.g. the Thai meaning"
                className="px-4 py-2.5 rounded-xl border border-outline-variant bg-white text-sm outline-none focus:border-primary resize-none"
              />
            </div>
            <button
              onClick={() => void saveEditor()}
              disabled={savingCard || !editor.front.trim() || !editor.back.trim()}
              data-testid="save-flashcard"
              className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold disabled:opacity-40 active:scale-95 transition-all"
            >
              {savingCard ? 'Saving...' : editor.id ? 'Save Changes' : 'Add Card'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
