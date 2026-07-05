import { useCallback, useEffect, useRef, useState } from 'react'
import { GrammarItem, GrammarEvaluationResult, GrammarPracticeAttempt } from '../types'

// Speaking practice for one grammar topic — same flow as Speaking Q&A:
// AI poses a situation, the learner answers by voice, AI grades the grammar
// and suggests a natural phrasing. Every attempt lands in practice history.
export default function GrammarSpeakPractice({
  grammar,
  onClose
}: {
  grammar: GrammarItem
  onClose: () => void
}): JSX.Element {
  const [question, setQuestion] = useState<{ question_en: string; question_th: string } | null>(null)
  const [loadingQuestion, setLoadingQuestion] = useState(true)
  const [showTranslate, setShowTranslate] = useState(false)
  const [result, setResult] = useState<GrammarEvaluationResult | null>(null)
  const [history, setHistory] = useState<GrammarPracticeAttempt[]>([])

  const [isRecording, setIsRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingMsg, setProcessingMsg] = useState('')
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [error, setError] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const loadHistory = useCallback(async () => {
    const rows = await window.api.grammar.practiceHistory(grammar.id)
    setHistory(rows as GrammarPracticeAttempt[])
  }, [grammar.id])

  const loadQuestion = useCallback(async () => {
    setLoadingQuestion(true)
    setResult(null)
    setShowTranslate(false)
    setError('')
    try {
      const q = await window.api.grammar.practiceQuestion(grammar.id)
      setQuestion(q)
    } catch (e) {
      setError('Could not generate a challenge: ' + String(e))
    } finally {
      setLoadingQuestion(false)
    }
  }, [grammar.id])

  useEffect(() => {
    void loadQuestion()
    void loadHistory()
  }, [loadQuestion, loadHistory])

  const playTts = useCallback(async (text: string) => {
    if (!text || ttsPlaying) return
    setTtsPlaying(true)
    try {
      const r = await window.api.tts.speak(text)
      const audio = new Audio(`file://${r.path}`)
      audio.onended = () => setTtsPlaying(false)
      audio.onerror = () => setTtsPlaying(false)
      await audio.play()
    } catch {
      setTtsPlaying(false)
    }
  }, [ttsPlaying])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()) }
      mr.start()
      setIsRecording(true)
    } catch (e) {
      alert('Microphone access denied: ' + String(e))
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || !question) return
    mediaRecorderRef.current.stop()
    setIsRecording(false)
    await new Promise<void>((resolve) => setTimeout(resolve, 400))

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    if (blob.size === 0) { alert('Recording is empty — please try again.'); return }

    setProcessing(true)
    setProcessingMsg('Transcribing your answer...')
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)
      let base64 = ''
      for (let i = 0; i < uint8.length; i += 8192) {
        base64 += String.fromCharCode(...uint8.subarray(i, i + 8192))
      }
      base64 = btoa(base64)

      const recPath = await window.api.recording.save(base64, `grammar_${Date.now()}.webm`)
      const { transcript } = await window.api.speaking.transcribe(recPath)
      if (!transcript.trim()) {
        alert('Could not hear anything — please try again.')
        return
      }
      setProcessingMsg('AI is checking your grammar...')
      const evaluation = await window.api.grammar.practiceEvaluate(
        grammar.id, question.question_en, transcript, recPath
      )
      setResult(evaluation)
      await loadHistory()
    } catch (e) {
      alert('Evaluation error: ' + String(e))
    } finally {
      setProcessing(false)
    }
  }, [grammar.id, question, loadHistory])

  const handleRecord = useCallback(() => {
    if (processing) return
    if (isRecording) void stopRecording()
    else void startRecording()
  }, [isRecording, processing, startRecording, stopRecording])

  const scoreColor = (score: number): string =>
    score >= 85 ? 'text-tertiary' : score >= 65 ? 'text-[#f59e0b]' : 'text-error'

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[720px] max-w-[calc(100vw-2rem)] h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="grammar-practice-modal"
      >
        <div className="p-5 border-b border-outline-variant flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-on-surface truncate">Practice: {grammar.name}</h2>
            {grammar.pattern && <p className="font-ipa-label text-ipa-label text-secondary truncate">{grammar.pattern}</p>}
          </div>
          <button onClick={onClose} className="text-secondary hover:text-primary shrink-0">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-6 flex flex-col gap-5 bg-background">
          {/* Challenge card */}
          {loadingQuestion ? (
            <div className="flex items-center justify-center gap-2 py-14 text-secondary">
              <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
              AI is writing a challenge for this grammar...
            </div>
          ) : error ? (
            <div className="p-5 bg-error-container/20 rounded-2xl text-error text-sm">
              {error}
              <button onClick={() => void loadQuestion()} className="block mt-2 font-bold underline">Retry</button>
            </div>
          ) : question ? (
            <div className="bg-white rounded-3xl border border-outline-variant shadow-sm p-6 flex flex-col items-center gap-4">
              <span className="text-label-sm text-secondary uppercase tracking-wider">Speak using this grammar</span>
              <p className="text-xl font-medium text-on-surface text-center leading-relaxed" data-testid="grammar-question">
                {question.question_en}
              </p>
              {showTranslate && question.question_th && (
                <p className="text-on-surface-variant italic text-center">{question.question_th}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void playTts(question.question_en)}
                  disabled={ttsPlaying}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full border-2 text-sm font-semibold transition-all ${
                    ttsPlaying ? 'border-tertiary bg-tertiary-container text-tertiary animate-pulse' : 'border-outline-variant text-secondary hover:bg-surface-container'
                  } disabled:opacity-60`}
                >
                  <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>volume_up</span>
                  Listen
                </button>
                <button
                  onClick={() => setShowTranslate((v) => !v)}
                  aria-pressed={showTranslate}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full border-2 text-sm font-semibold transition-colors ${
                    showTranslate ? 'border-primary bg-secondary-container text-primary' : 'border-outline-variant text-secondary hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">translate</span>
                  Translate
                </button>
                <button
                  onClick={() => void loadQuestion()}
                  disabled={processing || isRecording}
                  title="New challenge"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full border-2 border-outline-variant text-sm font-semibold text-secondary hover:bg-surface-container transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">casino</span>
                  New
                </button>
              </div>
            </div>
          ) : null}

          {/* Record / feedback */}
          {question && !result && !loadingQuestion && (
            <div className="flex flex-col items-center gap-3">
              {isRecording ? (
                <button
                  onClick={handleRecord}
                  data-testid="grammar-record"
                  className="px-8 py-3.5 bg-error text-on-error rounded-full flex items-center gap-2 shadow-md recording-active font-bold"
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
                  Stop &amp; Check
                </button>
              ) : (
                <button
                  onClick={handleRecord}
                  disabled={processing}
                  data-testid="grammar-record"
                  className="px-8 py-3.5 bg-primary text-on-primary rounded-full flex items-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all disabled:opacity-50 font-bold"
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
                  Answer by Speaking
                </button>
              )}
              {isRecording && (
                <div className="flex items-end gap-0.5 h-4">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="waveform-bar" style={{ animationDelay: `${i * 0.07}s` }} />
                  ))}
                </div>
              )}
              {processing && (
                <div className="flex items-center gap-2 text-secondary text-sm">
                  <span className="material-symbols-outlined animate-spin text-[16px]">refresh</span>
                  {processingMsg}
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="bg-white rounded-3xl border border-outline-variant shadow-sm p-6 flex flex-col gap-4" data-testid="grammar-feedback">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-3xl font-bold ${scoreColor(result.score)}`}>{result.score}%</span>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${result.used_target ? 'bg-tertiary-container/40 text-tertiary' : 'bg-error-container/30 text-error'}`}>
                  {result.used_target ? 'Used the grammar ✓' : 'Did not use the grammar'}
                </span>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${result.grammar_ok ? 'bg-tertiary-container/40 text-tertiary' : 'bg-error-container/30 text-error'}`}>
                  {result.grammar_ok ? 'Grammar correct' : 'Grammar needs work'}
                </span>
              </div>
              {result.feedback_th && (
                <div className="p-4 bg-primary-fixed rounded-xl">
                  <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-1">คำแนะนำ</p>
                  <p className="text-on-surface">{result.feedback_th}</p>
                </div>
              )}
              {result.corrected_sentence && (
                <div>
                  <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-1">ประโยคที่แก้แล้ว</p>
                  <div className="flex items-center gap-2 p-3 bg-surface-container-low rounded-xl">
                    <p className="text-on-surface flex-1">{result.corrected_sentence}</p>
                    <button
                      onClick={() => void playTts(result.corrected_sentence)}
                      disabled={ttsPlaying}
                      className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-container transition-colors disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>volume_up</span>
                    </button>
                  </div>
                </div>
              )}
              {result.suggested_answer && (
                <div>
                  <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-1">ควรพูดประมาณนี้</p>
                  <div className="flex items-center gap-2 p-3 bg-tertiary-container/15 rounded-xl">
                    <p className="text-on-surface flex-1">{result.suggested_answer}</p>
                    <button
                      onClick={() => void playTts(result.suggested_answer)}
                      disabled={ttsPlaying}
                      className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-container transition-colors disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>volume_up</span>
                    </button>
                  </div>
                </div>
              )}
              <div className="flex gap-3 mt-1">
                <button
                  onClick={() => setResult(null)}
                  className="flex-1 px-6 py-3 bg-surface-container text-on-surface rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">replay</span>
                  Try Again
                </button>
                <button
                  onClick={() => void loadQuestion()}
                  className="flex-1 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  Next Challenge
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>
          )}

          {/* Per-topic history */}
          {history.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-secondary uppercase tracking-wider">Practice history ({history.length})</p>
              {history.slice(0, 10).map((attempt) => (
                <div key={attempt.id} className="p-3 bg-white border border-outline-variant rounded-xl flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${scoreColor(attempt.score)}`}>{Math.round(attempt.score)}%</span>
                    <span className="text-xs text-secondary truncate flex-1">{attempt.question}</span>
                    <span className="text-[10px] text-secondary shrink-0">{new Date(attempt.created_at).toLocaleString('th-TH')}</span>
                  </div>
                  <p className="text-sm text-on-surface-variant">&ldquo;{attempt.transcript}&rdquo;</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
