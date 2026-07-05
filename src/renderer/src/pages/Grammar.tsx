import { useCallback, useEffect, useState } from 'react'
import { GrammarItem, GrammarDailyItem, GrammarPracticeAttempt } from '../types'
import GrammarSpeakPractice from '../components/GrammarSpeakPractice'

type Tab = 'library' | 'history'

export default function Grammar(): JSX.Element {
  const [tab, setTab] = useState<Tab>('library')
  const [items, setItems] = useState<GrammarItem[]>([])
  const [daily, setDaily] = useState<GrammarDailyItem[]>([])
  const [history, setHistory] = useState<GrammarPracticeAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [practicing, setPracticing] = useState<GrammarItem | null>(null)

  // Add-grammar modal
  const [showAdd, setShowAdd] = useState(false)
  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)
  const [addResult, setAddResult] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [list, due] = await Promise.all([
      window.api.grammar.list(),
      window.api.grammar.dailyDue()
    ])
    setItems(list as GrammarItem[])
    setDaily(due as GrammarDailyItem[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (tab === 'history') {
      void (async () => {
        const rows = await window.api.grammar.practiceHistory()
        setHistory(rows as GrammarPracticeAttempt[])
      })()
    }
  }, [tab, practicing])

  const handleAdd = async (): Promise<void> => {
    if (!addText.trim() || adding) return
    setAdding(true)
    setAddResult('')
    try {
      const result = await window.api.grammar.add(addText)
      setAddResult(result.merged ? `Updated existing topic: ${result.name}` : `Added: ${result.name}`)
      setAddText('')
      await load()
      setTimeout(() => { setShowAdd(false); setAddResult('') }, 1600)
    } catch (e) {
      setAddResult('Failed: ' + String(e))
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (g: GrammarItem, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!confirm(`Delete "${g.name}" and its practice history?`)) return
    await window.api.grammar.delete(g.id)
    await load()
  }

  const filtered = items.filter(
    (g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      (g.explanation_th || '').includes(search) ||
      (g.pattern || '').toLowerCase().includes(search.toLowerCase())
  )

  const parseExamples = (raw: string): { original: string; translate: string }[] => {
    try {
      return JSON.parse(raw) as { original: string; translate: string }[]
    } catch {
      return []
    }
  }

  const scoreColor = (score: number): string =>
    score >= 85 ? 'text-tertiary' : score >= 65 ? 'text-[#f59e0b]' : 'text-error'

  const practicedCount = daily.filter((d) => d.practiced_today).length

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="w-full h-16 flex items-center justify-between gap-4 px-gutter bg-surface-container-lowest border-b border-outline-variant drag-region">
        <div className="flex items-center gap-4 no-drag">
          <h1 className="text-xl font-bold text-on-surface">Grammar Library</h1>
          <div className="flex items-center rounded-xl bg-surface-container p-1" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'library'}
              onClick={() => setTab('library')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === 'library' ? 'bg-white text-primary shadow-sm' : 'text-secondary'}`}
            >
              Library ({items.length})
            </button>
            <button
              role="tab"
              aria-selected={tab === 'history'}
              onClick={() => setTab('history')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-secondary'}`}
            >
              Practice History
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          data-testid="add-grammar"
          className="no-drag flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:opacity-90 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add Grammar
        </button>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar p-gutter">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="material-symbols-outlined text-4xl text-secondary animate-spin">refresh</span>
          </div>
        ) : tab === 'history' ? (
          history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-secondary">
              <span className="material-symbols-outlined text-6xl opacity-30">history_edu</span>
              <p className="text-lg">No grammar practice yet</p>
              <p className="text-sm opacity-60">Practice a topic from the Library tab to build your history</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-3xl">
              {history.map((attempt) => (
                <div key={attempt.id} className="p-4 bg-white rounded-2xl border border-outline-variant flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-lg font-bold ${scoreColor(attempt.score)}`}>{Math.round(attempt.score)}%</span>
                    <span className="text-xs font-bold text-primary uppercase tracking-wide">{attempt.grammar_name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${attempt.used_target ? 'bg-tertiary-container/40 text-tertiary' : 'bg-error-container/30 text-error'}`}>
                      {attempt.used_target ? 'Used grammar' : 'Missed grammar'}
                    </span>
                    <span className="text-[10px] text-secondary ml-auto">{new Date(attempt.created_at).toLocaleString('th-TH')}</span>
                  </div>
                  <p className="text-sm text-secondary">{attempt.question}</p>
                  <p className="text-sm text-on-surface">&ldquo;{attempt.transcript}&rdquo;</p>
                  {attempt.feedback_th && <p className="text-xs text-secondary">{attempt.feedback_th}</p>}
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            {/* Today's practice — daily random selection */}
            {daily.length > 0 && (
              <div className="mb-6 p-5 bg-white rounded-2xl border border-outline-variant max-w-3xl" data-testid="grammar-daily">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#f59e0b]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
                    Today&rsquo;s Grammar Practice
                  </h2>
                  <span className="text-sm text-secondary">{practicedCount} / {daily.length} done</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {daily.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setPracticing(g)}
                      className={`p-4 rounded-xl border text-left transition-colors flex items-center gap-3 ${
                        g.practiced_today ? 'border-tertiary/40 bg-tertiary-container/10' : 'border-outline-variant hover:border-primary/40'
                      }`}
                    >
                      <span className={`material-symbols-outlined shrink-0 ${g.practiced_today ? 'text-tertiary' : 'text-outline-variant'}`} style={{ fontVariationSettings: g.practiced_today ? "'FILL' 1" : "'FILL' 0" }}>
                        {g.practiced_today ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-on-surface text-sm truncate">{g.name}</p>
                        {g.pattern && <p className="font-ipa-label text-[11px] text-secondary truncate">{g.pattern}</p>}
                      </div>
                      <span className="material-symbols-outlined text-primary shrink-0 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search */}
            <div className="relative mb-5 max-w-lg">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-sm">search</span>
              <input
                type="text"
                placeholder="Search grammar topics..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-outline-variant bg-white focus:outline-none focus:border-primary text-sm"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-secondary">
                <span className="material-symbols-outlined text-6xl opacity-30">library_books</span>
                <p className="text-lg">No grammar topics yet</p>
                <p className="text-sm opacity-60">Complete sessions and run analysis, or add topics you learned elsewhere</p>
                <button onClick={() => setShowAdd(true)} className="mt-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm">
                  Add your first grammar
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-w-3xl">
                {filtered.map((g) => {
                  const examples = parseExamples(g.examples)
                  const isExpanded = expanded === g.id

                  return (
                    <div
                      key={g.id}
                      className="bg-white rounded-2xl border border-outline-variant overflow-hidden"
                    >
                      <button
                        onClick={() => setExpanded(isExpanded ? null : g.id)}
                        className="w-full p-5 flex items-center gap-4 text-left hover:bg-surface-container-low transition-colors"
                      >
                        <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>library_books</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-on-surface">{g.name}</h3>
                          {g.pattern && (
                            <p className="font-ipa-label text-ipa-label text-secondary mt-0.5">{g.pattern}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-secondary">{examples.length} examples</span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); setPracticing(g) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setPracticing(g) } }}
                            data-testid="grammar-practice"
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-on-primary rounded-lg text-sm font-bold hover:opacity-90 active:scale-95 transition-all"
                          >
                            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
                            Practice
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => void handleDelete(g, e)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void handleDelete(g, e as unknown as React.MouseEvent) }}
                            title="Delete topic"
                            data-testid="grammar-delete"
                            className="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:text-error hover:bg-error-container/20 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </span>
                          <span className={`material-symbols-outlined text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            expand_more
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-5 pb-5 flex flex-col gap-4 border-t border-outline-variant">
                          {g.explanation_th && (
                            <div className="pt-4">
                              <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-1">คำอธิบาย</p>
                              <p className="text-base text-on-surface">{g.explanation_th}</p>
                            </div>
                          )}

                          {examples.length > 0 && (
                            <div>
                              <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-2">ตัวอย่าง</p>
                              <div className="flex flex-col gap-2">
                                {examples.map((ex, i) => (
                                  <div key={i} className="p-3 bg-surface-container-low rounded-xl">
                                    <p className="font-medium text-on-surface text-sm">{ex.original}</p>
                                    {ex.translate && (
                                      <p className="text-sm text-secondary mt-1">{ex.translate}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {g.last_seen_at && (
                            <p className="text-xs text-on-surface-variant">
                              Last seen: {new Date(g.last_seen_at).toLocaleDateString('th-TH')} · practiced {g.review_count} times
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add grammar modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !adding && setShowAdd(false)}>
          <div className="w-[560px] max-w-[calc(100vw-2rem)] bg-white rounded-3xl shadow-2xl p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-on-surface">Add Grammar Topic</h2>
              <button onClick={() => !adding && setShowAdd(false)} className="text-secondary hover:text-primary">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-sm text-on-surface-variant">
              พิมพ์หรือวางสิ่งที่เรียนมา (โน้ต, ประโยคตัวอย่าง, กฎ) — AI จะระบุว่าคือ grammar อะไร พร้อมสรุป pattern คำอธิบาย และตัวอย่างให้
            </p>
            <textarea
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              rows={6}
              placeholder={'เช่น  "I have been to Japan twice. — เคยไปญี่ปุ่นสองครั้ง ใช้พูดถึงประสบการณ์"'}
              data-testid="grammar-add-text"
              className="px-4 py-3 rounded-xl border border-outline-variant bg-white text-sm outline-none focus:border-primary resize-none"
            />
            {addResult && (
              <p className={`text-sm font-semibold ${addResult.startsWith('Failed') ? 'text-error' : 'text-tertiary'}`}>{addResult}</p>
            )}
            <button
              onClick={() => void handleAdd()}
              disabled={adding || !addText.trim()}
              data-testid="grammar-add-save"
              className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {adding ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  AI is analyzing your notes...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                  Analyze &amp; Add
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {practicing && (
        <GrammarSpeakPractice
          grammar={practicing}
          onClose={() => { setPracticing(null); void load() }}
        />
      )}
    </div>
  )
}
