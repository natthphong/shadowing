import { useState, useEffect } from 'react'
import { GrammarItem } from '../types'

export default function Grammar(): JSX.Element {
  const [items, setItems] = useState<GrammarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    ;(async () => {
      const data = await window.api.grammar.list()
      setItems(data as GrammarItem[])
      setLoading(false)
    })()
  }, [])

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

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="w-full h-16 flex items-center justify-between px-gutter bg-surface-container-lowest border-b border-outline-variant drag-region">
        <h1 className="text-xl font-bold text-on-surface no-drag">Grammar Library</h1>
        <span className="text-sm text-secondary no-drag">{items.length} topics</span>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar p-gutter">
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

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="material-symbols-outlined text-4xl text-secondary animate-spin">refresh</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-secondary">
            <span className="material-symbols-outlined text-6xl opacity-30">library_books</span>
            <p className="text-lg">No grammar topics yet</p>
            <p className="text-sm opacity-60">Complete sessions and run analysis to build your grammar library</p>
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
                          Last seen: {new Date(g.last_seen_at).toLocaleDateString('th-TH')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
