import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ExamQuiz, ExamReview, ExamSessionData, Session } from '../types'

type ExamMode = 'intro' | 'taking' | 'submitting' | 'review'

function formatDate(value: string): string {
  return new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function Exam(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const attemptId = useMemo(() => new URLSearchParams(location.search).get('attempt'), [location.search])
  const [session, setSession] = useState<Session | null>(null)
  const [data, setData] = useState<ExamSessionData>({ quiz: null, attempts: [] })
  const [mode, setMode] = useState<ExamMode>('intro')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState('Preparing the transcript...')
  const [questionCount, setQuestionCount] = useState(7)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<Array<number | null>>([])
  const [review, setReview] = useState<ExamReview | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setError('')
    const [sessionResult, examResult, attemptResult] = await Promise.all([
      window.api.sessions.get(sessionId),
      window.api.exam.getForSession(sessionId),
      attemptId ? window.api.exam.getAttempt(attemptId) : Promise.resolve(null)
    ])
    if (!sessionResult) {
      navigate('/sessions')
      return
    }

    const loadedSession = sessionResult as Session
    const saved = localStorage.getItem(`progress_max_${sessionId}`) ?? localStorage.getItem(`progress_${sessionId}`)
    const savedIndex = saved === null ? -1 : Number.parseInt(saved, 10)
    const localProgress = loadedSession.total_segments > 0 && savedIndex >= 0
      ? Math.min(100, Math.round(((savedIndex + 1) / loadedSession.total_segments) * 100))
      : 0
    if (localProgress > loadedSession.completion_percentage) {
      await window.api.sessions.updateProgress(sessionId, {
        completion_percentage: localProgress,
        ...(localProgress >= 100 ? { completed_at: new Date().toISOString() } : {})
      })
      loadedSession.completion_percentage = localProgress
    }

    setSession(loadedSession)
    setData(examResult)
    if (attemptResult) {
      setReview(attemptResult)
      setMode('review')
    } else {
      setMode('intro')
    }
    setLoading(false)
  }, [attemptId, navigate, sessionId])

  useEffect(() => { void load() }, [load])
  useEffect(() => window.api.exam.onProgress((progress) => setGenerationProgress(progress.msg)), [])

  const startQuiz = useCallback((quiz: ExamQuiz) => {
    setAnswers(Array.from({ length: quiz.questions.length }, () => null))
    setCurrentQuestion(0)
    setReview(null)
    setMode('taking')
    setError('')
  }, [])

  const generateQuiz = useCallback(async () => {
    if (!sessionId) return
    setGenerating(true)
    setGenerationProgress('Preparing the transcript...')
    setError('')
    try {
      const quiz = await window.api.exam.generate(sessionId, questionCount)
      setData((current) => ({ ...current, quiz }))
      startQuiz(quiz)
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : String(generateError))
    } finally {
      setGenerating(false)
    }
  }, [questionCount, sessionId, startQuiz])

  const submitQuiz = useCallback(async () => {
    if (!data.quiz) return
    setMode('submitting')
    try {
      const result = await window.api.exam.submit(data.quiz.id, answers)
      setReview(result)
      setData((current) => ({ ...current, attempts: [result.attempt, ...current.attempts] }))
      setMode('review')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
      setMode('taking')
    }
  }, [answers, data.quiz])

  if (loading || !session) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
      </div>
    )
  }

  const quiz = data.quiz
  const question = quiz?.questions[currentQuestion]
  const answeredCount = answers.filter((answer) => answer !== null).length
  const allAnswered = quiz ? answeredCount === quiz.questions.length : false

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="h-16 shrink-0 px-gutter flex items-center justify-between bg-white border-b border-outline-variant drag-region">
        <div className="flex items-center gap-3 min-w-0 no-drag">
          <button onClick={() => navigate('/sessions')} className="text-secondary hover:text-primary">Sessions</button>
          <span className="material-symbols-outlined text-outline-variant text-sm">chevron_right</span>
          <span className="font-bold truncate">{session.title}</span>
          <span className="px-2 py-0.5 rounded-full bg-tertiary-container/20 text-tertiary text-[10px] font-bold uppercase">Exam</span>
        </div>
        <button onClick={() => navigate('/exam-history')} className="no-drag flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-secondary hover:bg-surface-container">
          <span className="material-symbols-outlined text-[18px]">history</span>
          Exam History
        </button>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar p-gutter">
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="mb-4 p-4 rounded-xl bg-error-container text-on-error-container flex items-start gap-2">
              <span className="material-symbols-outlined">error</span>
              <p className="text-sm flex-1">{error}</p>
              <button onClick={() => setError('')}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
          )}

          {mode === 'intro' && (
            <div className="grid lg:grid-cols-[1.35fr_0.65fr] gap-5">
              <section className="p-7 bg-white rounded-3xl border border-outline-variant flex flex-col gap-6">
                <div className="w-14 h-14 rounded-2xl bg-primary-fixed text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>quiz</span>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-tertiary">Post-Session Exam</p>
                  <h1 className="mt-2 text-3xl font-bold text-on-surface">Check what you understood</h1>
                  <p className="mt-3 text-on-surface-variant leading-relaxed">
                    The local Post-Session Analysis model creates a short multiple-choice quiz from this clip. Results are saved so you can review answers and retake it anytime.
                  </p>
                </div>

                {quiz ? (
                  <div className="p-5 rounded-2xl bg-surface-container-low border border-outline-variant">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="font-bold text-lg">{quiz.title}</h2>
                        <p className="text-sm text-secondary mt-1">{quiz.questions.length} questions · Generated by {quiz.model || 'local AI'}</p>
                      </div>
                      <span className="px-2 py-1 rounded-lg bg-tertiary text-white text-xs font-bold">READY</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {quiz.tags.map((tag) => <span key={tag} className="px-2.5 py-1 rounded-full bg-white border border-outline-variant text-xs font-semibold text-secondary">{tag}</span>)}
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl bg-primary-fixed/50 border border-primary/10">
                    <p className="font-semibold text-on-surface">No exam generated yet</p>
                    <p className="text-sm text-secondary mt-1">Choose the length and let the local AI build one from the transcript.</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  {quiz && (
                    <button data-testid="start-exam" onClick={() => startQuiz(quiz)} className="px-6 py-3 rounded-xl bg-primary text-on-primary font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined">play_arrow</span>
                      {data.attempts.length > 0 ? 'Retake Exam' : 'Start Exam'}
                    </button>
                  )}
                  <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-container text-sm font-semibold text-secondary">
                    Questions
                    <select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} className="bg-transparent outline-none text-on-surface">
                      <option value={5}>5</option>
                      <option value={7}>7</option>
                      <option value={10}>10</option>
                    </select>
                  </label>
                  <button data-testid="generate-exam" onClick={() => void generateQuiz()} className={`${quiz ? 'bg-surface-container text-on-surface' : 'bg-tertiary text-white'} px-5 py-3 rounded-xl font-bold flex items-center gap-2`}>
                    <span className="material-symbols-outlined text-[19px]">auto_awesome</span>
                    {quiz ? 'Generate New Questions' : 'Generate AI Exam'}
                  </button>
                </div>
              </section>

              <aside className="p-5 bg-white rounded-3xl border border-outline-variant h-fit">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold">Previous attempts</h2>
                  <span className="text-xs text-secondary">{data.attempts.length}</span>
                </div>
                {data.attempts.length === 0 ? (
                  <p className="mt-6 text-sm text-secondary text-center">Your scores will appear here.</p>
                ) : (
                  <div className="mt-4 flex flex-col gap-2">
                    {data.attempts.slice(0, 8).map((attempt) => (
                      <button
                        key={attempt.id}
                        onClick={() => navigate(`/exam/${sessionId}?attempt=${attempt.id}`)}
                        className="p-3 rounded-xl hover:bg-surface-container-low flex items-center gap-3 text-left"
                      >
                        <span className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${attempt.score >= 80 ? 'bg-tertiary-container/20 text-tertiary' : 'bg-primary-fixed text-primary'}`}>{attempt.score}%</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{attempt.correct_count}/{attempt.total_questions} correct</span>
                          <span className="block text-[11px] text-secondary truncate">{formatDate(attempt.completed_at)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </aside>
            </div>
          )}

          {(mode === 'taking' || mode === 'submitting') && quiz && question && (
            <section data-testid="exam-question" className="bg-white rounded-3xl border border-outline-variant overflow-hidden">
              <div className="px-7 py-5 border-b border-outline-variant flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">Question {currentQuestion + 1} of {quiz.questions.length}</p>
                  <p className="text-sm text-secondary mt-1">{answeredCount} answered</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-secondary-container text-primary text-xs font-bold">{question.tag}</span>
              </div>
              <div className="h-1.5 bg-surface-container">
                <div className="h-full bg-primary transition-all" style={{ width: `${((currentQuestion + 1) / quiz.questions.length) * 100}%` }} />
              </div>
              <div className="p-8">
                <h1 className="text-2xl font-bold leading-relaxed text-on-surface">{question.question}</h1>
                <div className="mt-7 grid gap-3">
                  {question.options.map((option, index) => {
                    const selected = answers[currentQuestion] === index
                    return (
                      <button
                        key={option}
                        data-testid={`exam-option-${index}`}
                        onClick={() => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === currentQuestion ? index : answer))}
                        aria-pressed={selected}
                        className={`p-4 rounded-2xl border-2 text-left flex items-center gap-4 transition-colors ${selected ? 'border-primary bg-primary-fixed text-on-primary-fixed' : 'border-outline-variant hover:border-primary/40'}`}
                      >
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${selected ? 'bg-primary text-white' : 'bg-surface-container text-secondary'}`}>{String.fromCharCode(65 + index)}</span>
                        <span className="font-medium">{option}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="px-7 py-5 border-t border-outline-variant flex items-center justify-between">
                <button
                  onClick={() => currentQuestion === 0 ? setMode('intro') : setCurrentQuestion((index) => index - 1)}
                  className="px-5 py-2.5 rounded-xl bg-surface-container text-on-surface font-bold"
                >
                  {currentQuestion === 0 ? 'Exit' : 'Previous'}
                </button>
                {currentQuestion < quiz.questions.length - 1 ? (
                  <button data-testid="exam-next" onClick={() => setCurrentQuestion((index) => index + 1)} className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold">Next</button>
                ) : (
                  <button
                    onClick={() => void submitQuiz()}
                    data-testid="exam-submit"
                    disabled={!allAnswered || mode === 'submitting'}
                    className="px-6 py-2.5 rounded-xl bg-tertiary text-white font-bold disabled:opacity-40"
                  >
                    {mode === 'submitting' ? 'Grading...' : 'Submit Exam'}
                  </button>
                )}
              </div>
            </section>
          )}

          {mode === 'review' && review && (
            <div className="flex flex-col gap-5" data-testid="exam-review">
              <section className="p-7 rounded-3xl bg-white border border-outline-variant flex flex-wrap items-center gap-6">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold ${review.attempt.score >= 80 ? 'bg-tertiary-container/20 text-tertiary' : 'bg-primary-fixed text-primary'}`}>
                  {review.attempt.score}%
                </div>
                <div className="flex-1 min-w-[240px]">
                  <p className="text-xs font-bold uppercase tracking-wider text-tertiary">Exam complete</p>
                  <h1 className="text-2xl font-bold mt-1">{review.quiz.title}</h1>
                  <p className="text-secondary mt-2">{review.attempt.correct_count} of {review.attempt.total_questions} correct · {formatDate(review.attempt.completed_at)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.quiz.tags.map((tag) => <span key={tag} className="px-2.5 py-1 rounded-full bg-surface-container text-xs font-semibold text-secondary">{tag}</span>)}
                  </div>
                </div>
                <div className="flex gap-2">
                  {quiz && <button onClick={() => startQuiz(quiz)} className="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-bold">Retake</button>}
                  <button onClick={() => setMode('intro')} className="px-5 py-2.5 rounded-xl bg-surface-container text-on-surface font-bold">Exam Home</button>
                </div>
              </section>

              {review.quiz.questions.map((reviewQuestion, questionIndex) => (
                <section key={reviewQuestion.id} className="p-6 rounded-2xl bg-white border border-outline-variant">
                  <div className="flex items-start gap-3">
                    <span className={`material-symbols-outlined ${reviewQuestion.isCorrect ? 'text-tertiary' : 'text-error'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                      {reviewQuestion.isCorrect ? 'check_circle' : 'cancel'}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-bold text-lg">{questionIndex + 1}. {reviewQuestion.question}</h2>
                        <span className="px-2 py-1 rounded-full bg-secondary-container text-primary text-[10px] font-bold shrink-0">{reviewQuestion.tag}</span>
                      </div>
                      <div className="mt-4 grid gap-2">
                        {reviewQuestion.options.map((option, optionIndex) => {
                          const correct = optionIndex === reviewQuestion.correctIndex
                          const selected = optionIndex === reviewQuestion.selectedIndex
                          return (
                            <div key={option} className={`px-4 py-3 rounded-xl border ${correct ? 'border-tertiary bg-tertiary-container/10' : selected ? 'border-error bg-error-container/20' : 'border-outline-variant'}`}>
                              <span className="font-semibold mr-2">{String.fromCharCode(65 + optionIndex)}.</span>
                              {option}
                              {correct && <span className="ml-2 text-xs font-bold text-tertiary">Correct answer</span>}
                              {selected && !correct && <span className="ml-2 text-xs font-bold text-error">Your answer</span>}
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-4 p-4 rounded-xl bg-primary-fixed/60">
                        <p className="text-xs font-bold uppercase tracking-wide text-primary">Explanation</p>
                        <p className="mt-1 text-sm text-on-surface-variant">{reviewQuestion.explanation}</p>
                      </div>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>

      {generating && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 backdrop-blur-sm" data-testid="exam-generating-modal">
          <div className="w-[460px] max-w-[calc(100vw-2rem)] p-8 rounded-3xl bg-white border border-outline-variant shadow-2xl text-center flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-primary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
            </div>
            <div>
              <h2 className="text-xl font-bold">Creating your AI exam</h2>
              <p className="mt-2 text-sm text-secondary">{generationProgress}</p>
            </div>
            <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden"><div className="w-2/3 h-full rounded-full bg-primary animate-pulse" /></div>
            <p className="text-xs text-secondary">Generated locally with the configured Post-Session Analysis model.</p>
          </div>
        </div>
      )}
    </div>
  )
}
