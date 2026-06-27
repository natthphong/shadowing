import { useState, useEffect } from 'react'

interface ModelStatus {
  role: string
  model: string
  available: boolean
  readonly?: boolean
}

export default function Settings(): JSX.Element {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [modelStatus, setModelStatus] = useState<ModelStatus[]>([])
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [s, ms] = await Promise.all([window.api.settings.get(), window.api.models.status()])
      setSettings(s as Record<string, string>)
      setModelStatus(ms as ModelStatus[])
      setLoading(false)
    })()
  }, [])

  const handleSave = async (): Promise<void> => {
    await window.api.settings.setAll(settings)
    const ms = await window.api.models.status()
    setModelStatus(ms as ModelStatus[])
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const Field = ({
    label, settingKey, placeholder, hint
  }: {
    label: string
    settingKey: string
    placeholder?: string
    hint?: string
  }): JSX.Element => (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-on-surface">{label}</label>
      <input
        type="text"
        value={settings[settingKey] || ''}
        onChange={(e) => setSettings((s) => ({ ...s, [settingKey]: e.target.value }))}
        placeholder={placeholder}
        className="px-4 py-2.5 rounded-xl border border-outline-variant bg-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
      />
      {hint && <p className="text-xs text-on-surface-variant">{hint}</p>}
    </div>
  )

  const roleLabels: Record<string, string> = {
    bulk_translate_model: 'Translation (import)',
    interactive_translate_model: 'Interactive Translation',
    analysis_model: 'Post-Session Analysis',
    embedding_model: 'Embeddings',
    tts_model: 'TTS Voice (Orpheus)'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="material-symbols-outlined text-4xl text-secondary animate-spin">refresh</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="w-full h-16 flex items-center px-gutter bg-surface-container-lowest border-b border-outline-variant drag-region">
        <h1 className="text-xl font-bold text-on-surface no-drag">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar p-gutter">
        <div className="max-w-2xl flex flex-col gap-6">
          {/* Ollama */}
          <section className="p-5 bg-white rounded-2xl border border-outline-variant flex flex-col gap-4">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>memory</span>
              Ollama Connection
            </h2>
            <Field
              label="Ollama Base URL"
              settingKey="ollama_base_url"
              placeholder="http://localhost:11434"
              hint="Default: http://localhost:11434"
            />
          </section>

          {/* Models */}
          <section className="p-5 bg-white rounded-2xl border border-outline-variant flex flex-col gap-4">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
              AI Models
            </h2>

            <Field
              label="Whisper Model (HuggingFace)"
              settingKey="whisper_model"
              placeholder="mlx-community/whisper-large-v3-turbo"
              hint="Used for transcription. Downloaded automatically on first use."
            />
            <Field
              label="Translation Model (Ollama)"
              settingKey="bulk_translate_model"
              placeholder="scb10x/typhoon-translate1.5-4b"
              hint="Per-segment translation during import. Uses parallel workers."
            />
            <Field
              label="Interactive Translation Model (Ollama)"
              settingKey="interactive_translate_model"
              placeholder="scb10x/typhoon-translate1.5-4b"
              hint="Word/phrase translation on text selection in practice mode."
            />
            <Field
              label="Post-Session Analysis Model (Ollama)"
              settingKey="analysis_model"
              placeholder="qwen3.5:9b"
              hint="AI feedback, vocab extraction, flashcard generation after session."
            />
            <Field
              label="Embedding Model (Ollama)"
              settingKey="embedding_model"
              placeholder="bge-m3"
            />
            {/* TTS model — display only, not editable */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-on-surface flex items-center gap-2">
                TTS Model (Ollama)
                <span className="text-[10px] font-bold px-2 py-0.5 bg-surface-container text-secondary rounded-full">Read-only</span>
              </label>
              <div className="px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container text-sm text-on-surface-variant font-ipa-label select-all">
                {settings['tts_model'] || 'legraphista/Orpheus:latest'}
              </div>
              <p className="text-xs text-on-surface-variant">TTS voice model. Pull with: <code className="bg-surface-container px-1 rounded">ollama pull legraphista/Orpheus:latest</code></p>
            </div>
          </section>

          {/* Practice */}
          <section className="p-5 bg-white rounded-2xl border border-outline-variant flex flex-col gap-4">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>tune</span>
              Practice Settings
            </h2>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-on-surface">Low Score Threshold (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={settings['low_score_threshold'] || '70'}
                onChange={(e) => setSettings((s) => ({ ...s, low_score_threshold: e.target.value }))}
                className="px-4 py-2.5 rounded-xl border border-outline-variant bg-white focus:outline-none focus:border-primary w-32 text-sm"
              />
              <p className="text-xs text-on-surface-variant">Sentences below this score get added to flashcard review</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-on-surface">Translation Workers</label>
              <input
                type="number"
                min={1}
                max={8}
                value={settings['translate_workers'] || '2'}
                onChange={(e) => setSettings((s) => ({ ...s, translate_workers: e.target.value }))}
                className="px-4 py-2.5 rounded-xl border border-outline-variant bg-white focus:outline-none focus:border-primary w-32 text-sm"
              />
              <p className="text-xs text-on-surface-variant">Parallel workers for translation (default 2 — segments split evenly per worker)</p>
            </div>
          </section>

          {/* Model Status */}
          <section className="p-5 bg-white rounded-2xl border border-outline-variant flex flex-col gap-3">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              Model Status
            </h2>
            {modelStatus.map((m) => (
              <div key={m.role} className="flex items-center gap-3 py-2 border-b border-outline-variant last:border-0">
                <div className={`w-2 h-2 rounded-full ${m.available ? 'bg-tertiary' : m.readonly ? 'bg-outline-variant' : 'bg-error'}`} />
                <span className="text-sm text-secondary flex-1">{roleLabels[m.role] || m.role}</span>
                <span className="font-ipa-label text-ipa-label text-on-surface">{m.model}</span>
                <span className={`text-xs font-semibold ${m.available ? 'text-tertiary' : m.readonly ? 'text-secondary' : 'text-error'}`}>
                  {m.available ? 'Ready' : m.readonly ? 'Optional' : 'Missing'}
                </span>
              </div>
            ))}
            <p className="text-xs text-on-surface-variant mt-1">
              Run <code className="bg-surface-container px-1 rounded">ollama pull {'{model}'}</code> to install missing models
            </p>
          </section>

          {/* Save */}
          <button
            onClick={handleSave}
            className="px-8 py-3 bg-primary text-on-primary rounded-xl font-bold hover:opacity-90 active:scale-95 transition-all flex items-center gap-2 self-start"
          >
            {saved ? (
              <>
                <span className="material-symbols-outlined text-sm">check</span>
                Saved!
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">save</span>
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
