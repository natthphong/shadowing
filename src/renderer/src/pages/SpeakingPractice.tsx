import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SpeakingAnswer,
  SpeakingEvaluationResult,
  SpeakingHistoryEntry,
  SpeakingQuestion,
  SpeakingSessionOption
} from '../types'

type Tab = 'practice' | 'history'
type Step = 'setup' | 'generating' | 'quiz' | 'done'

function parseSuggestion(raw: string | null): { corrected: string; suggested: string } {
  if (!raw) return { corrected: '', suggested: '' }
  try {
    const parsed = JSON.parse(raw) as { corrected?: string; suggested?: string }
    return { corrected: parsed.corrected || '', suggested: parsed.suggested || '' }
  } catch {
    return { corrected: '', suggested: raw }
  }
}

export default function SpeakingPractice(): JSX.Element {
  const [tab, setTab] = useState<Tab>('practice')
  const [step, setStep] = useState<Step>('setup')

  // Setup
  const [sessions, setSessions] = useState<SpeakingSessionOption[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [questionCount, setQuestionCount] = useState(5)
  const [progressMsg, setProgressMsg] = useState('')

  // Quiz
  const [questions, setQuestions] = useState<SpeakingQuestion[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [showTranslate, setShowTranslate] = useState(false)
  const [results, setResults] = useState<Record<string, SpeakingEvaluationResult>>({})

  // Recording / evaluation
  const [isRecording, setIsRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingMsg, setProcessingMsg] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // TTS
  const [ttsPlaying, setTtsPlaying] = useState(false)

  // History
  const [history, setHistory] = useState<SpeakingHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null)
  const [expandedAnswers, setExpandedAnswers] = useState<SpeakingAnswer[]>([])

  useEffect(() => {
    ;(async () => {
      const list = await window.api.speaking.sessions()
      setSessions(list as SpeakingSessionOption[])
    })()
  }, [])

  useEffect(() => window.api.speaking.onProgress((data) => {
    setProgressMsg(data.msg)
    setProcessingMsg(data.msg)
  }), [])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    const rows = await window.api.speaking.history()
    setHistory(rows as SpeakingHistoryEntry[])
    setHistoryLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'history') void loadHistory()
  }, [tab, loadHistory])

  const startQuiz = useCallback(async () => {
    if (!selectedSession) return
    setStep('generating')
    setProgressMsg('Preparing questions...')
    try {
      const { questions: generated } = await window.api.speaking.generate(selectedSession, questionCount)
      setQuestions(generated)
      setCurrentIdx(0)
      setResults({})
      setShowTranslate(false)
      setStep('quiz')
    } catch (e) {
      alert('Could not generate questions: ' + String(e))
      setStep('setup')
    }
  }, [selectedSession, questionCount])

  const currentQuestion = questions[currentIdx]
  const currentResult = currentQuestion ? results[currentQuestion.id] : undefined

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
    if (!mediaRecorderRef.current || !currentQuestion) return
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

      const recPath = await window.api.recording.save(base64, `speak_${Date.now()}.webm`)
      const { transcript } = await window.api.speaking.transcribe(recPath)
      if (!transcript.trim()) {
        alert('Could not hear anything — please try again.')
        return
      }
      setProcessingMsg('AI is checking your grammar...')
      const evaluation = await window.api.speaking.evaluate(currentQuestion.id, transcript, recPath)
      setResults((prev) => ({ ...prev, [currentQuestion.id]: evaluation }))
    } catch (e) {
      alert('Evaluation error: ' + String(e))
    } finally {
      setProcessing(false)
    }
  }, [currentQuestion])

  const handleRecord = useCallback(() => {
    if (processing) return
    if (isRecording) void stopRecording()
    else void startRecording()
  }, [isRecording, processing, startRecording, stopRecording])

  const goNext = useCallback(() => {
    if (currentIdx >= questions.length - 1) setStep('done')
    else {
      setCurrentIdx((i) => i + 1)
      setShowTranslate(false)
    }
  }, [currentIdx, questions.length])

  const retry = useCallback(() => {
    if (!currentQuestion) return
    setResults((prev) => {
      const next = { ...prev }
      delete next[currentQuestion.id]
      return next
    })
  }, [currentQuestion])

  const toggleHistoryQuestion = useCallback(async (questionId: string) => {
    if (expandedQuestion === questionId) {
      setExpandedQuestion(null)
      setExpandedAnswers([])
      return
    }
    setExpandedQuestion(questionId)
    const answers = await window.api.speaking.answers(questionId)
    setExpandedAnswers(answers as SpeakingAnswer[])
  }, [expandedQuestion])

  const scoreColor = (score: number): string =>
    score >= 85 ? 'text-tertiary' : score >= 65 ? 'text-[#f59e0b]' : 'text-error'

  const answeredScores = questions
    .map((q) => results[q.id]?.score)
    .filter((s): s is number => typeof s === 'number')
  const avgScore = answeredScores.length > 0
    ? Math.round(answeredScores.reduce((a, b) => a + b, 0) / answeredScores.length)
    : 0

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="w-full min-h-16 flex items-center justify-between gap-4 px-gutter bg-surface-container-lowest border-b border-outline-variant drag-region">
        <div className="flex items-center gap-4 no-drag">
          <h1 className="text-xl font-bold text-on-surface">Speaking Q&amp;A</h1>
          <div className="flex items-center rounded-xl bg-surface-container p-1" role="tablist" aria-label="Speaking view">
            <button
              role="tab"
              aria-selected={tab === 'practice'}
              onClick={() => setTab('practice')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === 'practice' ? 'bg-white text-primary shadow-sm' : 'text-secondary'}`}
            >
              Practice
            </button>
            <button
              role="tab"
              aria-selected={tab === 'history'}
              onClick={() => setTab('history')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-secondary'}`}
            >
              My Answers
            </button>
          </div>
        </div>
        {step === 'quiz' && tab === 'practice' && (
          <span className="text-sm text-secondary no-drag">Question {currentIdx + 1} / {questions.length}</span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar p-gutter">
        {tab === 'history' ? (
          /* ── Answer history ─────────────────────────────────────────────── */
          historyLoading ? (
            <div className="flex items-center justify-center h-40">
              <span className="material-symbols-outlined text-4xl text-secondary animate-spin">refresh</span>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-secondary">
              <span className="material-symbols-outlined text-6xl opacity-30">forum</span>
              <p className="text-lg">No speaking answers yet</p>
              <p className="text-sm opacity-60">Answer questions in the Practice tab to build your history</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-3xl mx-auto">
              {history.map((entry) => {
                const isExpanded = expandedQuestion === entry.id
                return (
                  <div key={entry.id} className="bg-white rounded-2xl border border-outline-variant overflow-hidden">
                    <button
                      onClick={() => void toggleHistoryQuestion(entry.id)}
                      className="w-full p-4 flex items-center gap-4 text-left hover:bg-surface-container-low transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-on-surface text-sm">{entry.question_en}</p>
                        <p className="text-xs text-secondary mt-0.5 truncate">
                          {entry.session_title} · {new Date(entry.created_at).toLocaleDateString('th-TH')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {entry.best_score != null && (
                          <span className={`text-sm font-bold ${scoreColor(entry.best_score)}`}>{Math.round(entry.best_score)}%</span>
                        )}
                        <span className="text-xs text-secondary">{entry.answer_count} answer(s)</span>
                        <span className={`material-symbols-outlined text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 flex flex-col gap-2 border-t border-outline-variant pt-3">
                        {expandedAnswers.length === 0 ? (
                          <p className="text-sm text-secondary">No answers recorded for this question yet</p>
                        ) : expandedAnswers.map((answer) => {
                          const suggestion = parseSuggestion(answer.suggested_answer)
                          return (
                            <div key={answer.id} className="p-3 bg-surface-container-low rounded-xl flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${scoreColor(answer.score)}`}>{Math.round(answer.score)}%</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${answer.grammar_ok ? 'bg-tertiary-container/40 text-tertiary' : 'bg-error-container/30 text-error'}`}>
                                  {answer.grammar_ok ? 'Grammar OK' : 'Grammar issues'}
                                </span>
                                <span className="text-[10px] text-secondary ml-auto">{new Date(answer.created_at).toLocaleString('th-TH')}</span>
                              </div>
                              <p className="text-sm text-on-surface">&ldquo;{answer.transcript}&rdquo;</p>
                              {answer.feedback_th && <p className="text-xs text-secondary">{answer.feedback_th}</p>}
                              {suggestion.suggested && (
                                <p className="text-xs text-primary">Suggested: {suggestion.suggested}</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        ) : step === 'setup' ? (
          /* ── Setup: pick session + count ────────────────────────────────── */
          <div className="max-w-xl mx-auto flex flex-col gap-6 py-8">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="material-symbols-outlined text-5xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>interpreter_mode</span>
              <h2 className="text-2xl font-bold text-on-surface">Quick speaking practice</h2>
              <p className="text-sm text-secondary">
                Pick a finished session — AI asks questions about it in English, you answer out loud, and AI checks your grammar and suggests better phrasing.
              </p>
            </div>

            {sessions.length === 0 ? (
              <div className="p-6 bg-white rounded-2xl border border-outline-variant text-center text-secondary">
                <p className="font-semibold">No completed sessions yet</p>
                <p className="text-sm opacity-70 mt-1">Finish a session to 100% first, then come back here</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-on-surface">Session</label>
                  <div className="flex flex-col gap-2 max-h-72 overflow-y-auto no-scrollbar">
                    {sessions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSession(s.id)}
                        className={`p-4 rounded-xl border text-left transition-colors flex items-center gap-3 ${
                          selectedSession === s.id ? 'border-primary bg-secondary-container/40' : 'border-outline-variant bg-white hover:border-primary/40'
                        }`}
                      >
                        <span className={`material-symbols-outlined ${selectedSession === s.id ? 'text-primary' : 'text-outline-variant'}`} style={{ fontVariationSettings: selectedSession === s.id ? "'FILL' 1" : "'FILL' 0" }}>
                          {selectedSession === s.id ? 'radio_button_checked' : 'radio_button_unchecked'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-on-surface text-sm truncate">{s.title}</p>
                          <p className="text-xs text-secondary">{s.total_segments} sentences{s.question_count > 0 ? ` · ${s.question_count} past questions` : ''}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-on-surface">Number of questions</label>
                  <div className="flex gap-2">
                    {[3, 5, 7, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() => setQuestionCount(n)}
                        className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-colors ${
                          questionCount === n ? 'bg-primary text-on-primary' : 'bg-surface-container text-secondary hover:text-primary'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => void startQuiz()}
                  disabled={!selectedSession}
                  data-testid="start-speaking"
                  className="px-8 py-3.5 bg-primary text-on-primary rounded-xl font-bold disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">mic</span>
                  Start Speaking Practice
                </button>
              </>
            )}
          </div>
        ) : step === 'generating' ? (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
            <p className="font-semibold text-on-surface">Generating questions...</p>
            <p className="text-sm text-secondary">{progressMsg}</p>
          </div>
        ) : step === 'done' ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <span className="material-symbols-outlined text-6xl text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>celebration</span>
            <h2 className="text-2xl font-bold text-on-surface">Practice complete</h2>
            <p className="text-secondary">
              You answered {answeredScores.length} of {questions.length} questions
              {answeredScores.length > 0 ? <> · average score <span className={`font-bold ${scoreColor(avgScore)}`}>{avgScore}%</span></> : null}
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setStep('setup'); setQuestions([]) }} className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold">New Practice</button>
              <button onClick={() => setTab('history')} className="px-6 py-3 bg-surface-container text-on-surface rounded-xl font-bold">View My Answers</button>
            </div>
          </div>
        ) : currentQuestion ? (
          /* ── Quiz: one question at a time ───────────────────────────────── */
          <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-6 py-8">
            <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(currentIdx / questions.length) * 100}%` }} />
            </div>

            <div className="w-full bg-white rounded-3xl border border-outline-variant shadow-sm p-8 flex flex-col items-center gap-4">
              <span className="text-label-sm text-secondary uppercase tracking-wider">Question {currentIdx + 1}</span>
              <p className="text-2xl font-medium text-on-surface text-center leading-relaxed" data-testid="speaking-question">
                {currentQuestion.question_en}
              </p>
              {showTranslate && currentQuestion.question_th && (
                <p className="text-on-surface-variant italic text-center">{currentQuestion.question_th}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void playTts(currentQuestion.question_en)}
                  disabled={ttsPlaying}
                  title="Listen to the question"
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
              </div>
            </div>

            {!currentResult ? (
              <div className="flex flex-col items-center gap-4">
                {isRecording ? (
                  <button
                    onClick={handleRecord}
                    data-testid="speaking-record"
                    className="px-8 py-3.5 bg-error text-on-error rounded-full flex items-center gap-2 shadow-md recording-active font-bold"
                  >
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
                    Stop &amp; Check
                  </button>
                ) : (
                  <button
                    onClick={handleRecord}
                    disabled={processing}
                    data-testid="speaking-record"
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
                    {processingMsg || 'Processing...'}
                  </div>
                )}
                <button onClick={goNext} className="text-sm text-secondary hover:text-primary transition-colors">
                  Skip this question
                </button>
              </div>
            ) : (
              /* Feedback card */
              <div className="w-full bg-white rounded-3xl border border-outline-variant shadow-sm p-6 flex flex-col gap-4" data-testid="speaking-feedback">
                <div className="flex items-center gap-3">
                  <span className={`text-3xl font-bold ${scoreColor(currentResult.score)}`}>{currentResult.score}%</span>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${currentResult.grammar_ok ? 'bg-tertiary-container/40 text-tertiary' : 'bg-error-container/30 text-error'}`}>
                    {currentResult.grammar_ok ? 'Grammar correct' : 'Grammar needs work'}
                  </span>
                </div>
                {currentResult.feedback_th && (
                  <div className="p-4 bg-primary-fixed rounded-xl">
                    <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-1">คำแนะนำ</p>
                    <p className="text-on-surface">{currentResult.feedback_th}</p>
                  </div>
                )}
                {currentResult.corrected_sentence && (
                  <div>
                    <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-1">ประโยคที่แก้แล้ว</p>
                    <div className="flex items-center gap-2 p-3 bg-surface-container-low rounded-xl">
                      <p className="text-on-surface flex-1">{currentResult.corrected_sentence}</p>
                      <button
                        onClick={() => void playTts(currentResult.corrected_sentence)}
                        disabled={ttsPlaying}
                        title="Listen"
                        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-container transition-colors disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>volume_up</span>
                      </button>
                    </div>
                  </div>
                )}
                {currentResult.suggested_answer && (
                  <div>
                    <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-1">ตัวอย่างคำตอบที่เป็นธรรมชาติ</p>
                    <div className="flex items-center gap-2 p-3 bg-tertiary-container/15 rounded-xl">
                      <p className="text-on-surface flex-1">{currentResult.suggested_answer}</p>
                      <button
                        onClick={() => void playTts(currentResult.suggested_answer)}
                        disabled={ttsPlaying}
                        title="Listen"
                        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-container transition-colors disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>volume_up</span>
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={retry}
                    data-testid="speaking-retry"
                    className="flex-1 px-6 py-3 bg-surface-container text-on-surface rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">replay</span>
                    Try Again
                  </button>
                  <button
                    onClick={goNext}
                    data-testid="speaking-next"
                    className="flex-1 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    {currentIdx >= questions.length - 1 ? 'Finish' : 'Next Question'}
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
