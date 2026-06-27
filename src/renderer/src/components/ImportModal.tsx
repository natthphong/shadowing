import { useState, useCallback } from 'react'
import { ImportProgress } from '../types'

interface Props {
  onClose: () => void
  onSuccess: (sessionId: string) => void
}

type Tab = 'youtube' | 'file' | 'transcript'

export default function ImportModal({ onClose, onSuccess }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('youtube')
  const [url, setUrl] = useState('')
  const [transcriptText, setTranscriptText] = useState('')
  const [transcriptTitle, setTranscriptTitle] = useState('My Transcript')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const handleImport = useCallback(async () => {
    setError(null)
    setImporting(true)
    setProgress({ step: 'start', detail: 'Starting...', pct: 0 })

    const unsub = window.api.import.onProgress((p) => setProgress(p))

    try {
      let result: { sessionId: string }

      if (tab === 'youtube') {
        if (!url.trim()) throw new Error('Please enter a YouTube URL')
        result = await window.api.import.youtube(url.trim())
      } else if (tab === 'file') {
        if (!selectedFile) throw new Error('Please select a file')
        result = await window.api.import.file(selectedFile)
      } else {
        if (!transcriptText.trim()) throw new Error('Please enter transcript text')
        result = await window.api.import.transcript(transcriptText.trim(), transcriptTitle)
      }

      unsub()
      onSuccess(result.sessionId)
    } catch (err) {
      unsub()
      setError(String(err instanceof Error ? err.message : err))
      setImporting(false)
      setProgress(null)
    }
  }, [tab, url, selectedFile, transcriptText, transcriptTitle, onSuccess])

  const pickFile = useCallback(async () => {
    const path = await window.api.dialog.openFile()
    if (path) setSelectedFile(path)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-[560px] max-w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-outline-variant flex items-center justify-between">
          <h2 className="text-xl font-bold text-on-surface">New Session</h2>
          <button
            onClick={onClose}
            disabled={importing}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors text-secondary"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant">
          {(['youtube', 'file', 'transcript'] as Tab[]).map((t) => (
            <button
              key={t}
              disabled={importing}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors capitalize ${
                tab === t
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-secondary hover:text-on-surface'
              }`}
            >
              {t === 'youtube' ? 'YouTube' : t === 'file' ? 'Local File' : 'Paste Text'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {tab === 'youtube' && (
            <div className="flex flex-col gap-4">
              <label className="text-sm font-semibold text-on-surface">YouTube URL</label>
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={importing}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <p className="text-xs text-on-surface-variant">
                The app will download audio, transcribe with Whisper, and translate all segments to Thai.
              </p>
            </div>
          )}

          {tab === 'file' && (
            <div className="flex flex-col gap-4">
              <label className="text-sm font-semibold text-on-surface">Select Media File</label>
              <button
                onClick={pickFile}
                disabled={importing}
                className="w-full py-8 border-2 border-dashed border-outline-variant rounded-xl flex flex-col items-center gap-2 hover:border-primary hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-4xl text-secondary">upload_file</span>
                <span className="text-sm text-secondary">Click to select file</span>
                <span className="text-xs text-on-surface-variant">MP4, MOV, MKV, MP3, WAV, M4A, FLAC</span>
              </button>
              {selectedFile && (
                <div className="flex items-center gap-2 px-3 py-2 bg-primary-fixed rounded-lg">
                  <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                  <span className="text-sm text-on-primary-fixed truncate">{selectedFile.split('/').pop()}</span>
                </div>
              )}
            </div>
          )}

          {tab === 'transcript' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-semibold text-on-surface">Title</label>
                <input
                  type="text"
                  value={transcriptTitle}
                  onChange={(e) => setTranscriptTitle(e.target.value)}
                  disabled={importing}
                  className="w-full mt-1 px-4 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface">Transcript (English)</label>
                <textarea
                  placeholder="Paste English text here. Each line becomes a practice sentence."
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  disabled={importing}
                  rows={8}
                  className="w-full mt-1 px-4 py-3 rounded-xl border border-outline-variant bg-surface text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex justify-between text-xs text-on-surface-variant">
                <span>{progress.detail}</span>
                <span>{progress.pct}%</span>
              </div>
              <div className="h-2 bg-surface-container rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-error-container rounded-xl flex items-start gap-2">
              <span className="material-symbols-outlined text-error text-sm mt-0.5">error</span>
              <span className="text-sm text-on-error-container">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={importing}
            className="px-6 py-2.5 rounded-xl border border-outline-variant text-secondary hover:bg-surface-container font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {importing ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                Importing...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">download</span>
                Import
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
