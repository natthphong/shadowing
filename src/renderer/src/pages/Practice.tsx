import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Session, Segment, PracticeAttempt, ScoreResult } from '../types'
import { useAppStore } from '../store'
import { useAutoFitText } from '../hooks/useAutoFitText'

type SessionWithMeta = Session & {
  source_type?: string
  url?: string
  thumbnail?: string
  local_media_path?: string
}

type FlashcardToast = { msg: string; type: 'success' | 'exists' | 'error' }

const VIDEO_TYPES = new Set(['mp4', 'mov', 'mkv', 'avi', 'webm'])

export default function Practice(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  useAppStore()

  const [session, setSession] = useState<SessionWithMeta | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [showTranslation, setShowTranslation] = useState(true)
  const [showIPA, setShowIPA] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [looping, setLooping] = useState(false)
  const [autoPlay, setAutoPlay] = useState(false)
  const [showTranscript, setShowTranscript] = useState(true)

  // Media playback state
  const [isMediaPlaying, setIsMediaPlaying] = useState(false)
  const [mediaProgress, setMediaProgress] = useState(0)

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingPath, setRecordingPath] = useState<string | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [lastScores, setLastScores] = useState<ScoreResult | null>(null)
  const [lastAttempts, setLastAttempts] = useState<PracticeAttempt[]>([])
  const [userTranscript, setUserTranscript] = useState('')

  // Translation popup
  const [selectedText, setSelectedText] = useState('')
  const [translationResult, setTranslationResult] = useState('')
  const [translating, setTranslating] = useState(false)

  // Flashcard toast
  const [flashcardToast, setFlashcardToast] = useState<FlashcardToast | null>(null)
  const flashcardToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Analysis
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null)
  const [showAnalysis, setShowAnalysis] = useState(false)

  // TTS
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)

  // Media refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const mediaSrcRef = useRef<string>('')         // tracks currently-loaded src to avoid unnecessary reloads
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingStartRef = useRef<number>(0)
  const transcriptRef = useRef<HTMLDivElement>(null)

  // Auto-fit text: ref for the sentence container
  const sentenceBoxRef = useRef<HTMLDivElement>(null)

  // Autoplay guard: don't fire on initial mount
  const isInitialMount = useRef(true)
  const autoPlayRef = useRef(autoPlay)
  useEffect(() => { autoPlayRef.current = autoPlay }, [autoPlay])

  const currentSegment = segments[currentIdx]

  // Apply auto-fit font to the sentence box whenever text changes
  useAutoFitText(sentenceBoxRef, currentSegment?.original ?? '', { minPx: 18, maxPx: 52 })

  // Derived media type
  const sourceType = session?.source_type || ''
  const isYouTube = sourceType === 'youtube'
  const isVideoFile = VIDEO_TYPES.has(sourceType)
  // isPlayableVideo: true when we have an actual video file to show in <video> element.
  // Covers local video files AND YouTube sessions where the MP4 was successfully downloaded.
  const localMedia = session?.local_media_path || ''
  const isPlayableVideo = isVideoFile || (isYouTube && /\.(mp4|mov|mkv|webm)$/i.test(localMedia))
  const showVideoPlayer = isYouTube || isVideoFile

  const getMediaEl = useCallback(
    (): HTMLAudioElement | HTMLVideoElement | null =>
      isPlayableVideo ? videoRef.current : audioRef.current,
    [isPlayableVideo]
  )

  // ── Session load + progress restore ──────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return
    ;(async () => {
      const data = await window.api.sessions.get(sessionId)
      if (!data) { navigate('/sessions'); return }
      setSession(data as SessionWithMeta)
      const segs: Segment[] = ((data as Record<string, unknown>).segments as Segment[]) || []
      setSegments(segs)
      const saved = localStorage.getItem(`progress_${sessionId}`)
      if (saved !== null) {
        const idx = parseInt(saved, 10)
        if (!isNaN(idx) && idx >= 0 && idx < segs.length) setCurrentIdx(idx)
      }
    })()
  }, [sessionId, navigate])

  useEffect(() => {
    if (sessionId && segments.length > 0) {
      localStorage.setItem(`progress_${sessionId}`, String(currentIdx))
    }
  }, [currentIdx, sessionId, segments.length])

  // Autoplay when segment changes
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return }
    if (autoPlayRef.current && currentSegment) {
      const t = setTimeout(() => playSegment(), 200)
      return () => clearTimeout(t)
    }
  }, [currentIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll active transcript card into view
  useEffect(() => {
    if (currentSegment && transcriptRef.current) {
      transcriptRef.current.querySelector('[data-active="true"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentIdx, currentSegment])

  // Load attempts for current segment
  useEffect(() => {
    if (!currentSegment) return
    loadAttempts(currentSegment.id)
  }, [currentSegment?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadAttempts = useCallback(async (segId: string) => {
    const attempts = await window.api.practice.getAttempts(segId)
    setLastAttempts(attempts as PracticeAttempt[])
    const best = (attempts as PracticeAttempt[]).reduce<PracticeAttempt | null>(
      (b, a) => (!b || a.overall_score > b.overall_score ? a : b), null
    )
    if (best) {
      setLastScores({
        accuracy_score: best.accuracy_score,
        pronunciation_score: best.pronunciation_score,
        rhythm_score: best.rhythm_score,
        speed_score: best.speed_score,
        overall_score: best.overall_score,
        missing_words: [],
        incorrect_words: [],
        extra_words: [],
        feedback_text: best.feedback || ''
      })
    } else {
      setLastScores(null)
    }
    setUserTranscript('')
  }, [])

  // ── Media playback ────────────────────────────────────────────────────────
  const playSegment = useCallback((seg?: Segment) => {
    const s = seg || currentSegment
    const mediaPath = session?.local_media_path
    if (!s || !mediaPath) return
    const el = getMediaEl()
    if (!el) return

    const newSrc = `file://${mediaPath}`

    // Seek to segment start then play; wire up the stop-at-end handler.
    const doPlay = (): void => {
      el.playbackRate = playbackSpeed
      el.currentTime = s.start_time
      el.play().catch(() => {})
      el.ontimeupdate = () => {
        const segDur = s.end_time - s.start_time
        if (segDur > 0) {
          setMediaProgress(Math.min(100, ((el.currentTime - s.start_time) / segDur) * 100))
        }
        if (el.currentTime >= s.end_time) {
          el.pause()
          el.ontimeupdate = null
          setIsMediaPlaying(false)
          setMediaProgress(100)
          if (looping) setTimeout(() => playSegment(s), 500)
        }
      }
    }

    setIsMediaPlaying(true)
    setMediaProgress(0)

    if (mediaSrcRef.current === newSrc && el.readyState >= 1) {
      // Media already loaded at this source — just seek and play, no reload needed.
      doPlay()
    } else {
      // New source or not loaded yet — set src, wait for loadedmetadata before seeking.
      mediaSrcRef.current = newSrc
      el.src = newSrc
      el.addEventListener('loadedmetadata', doPlay, { once: true })
      el.load()
    }
  }, [currentSegment, session, playbackSpeed, looping, getMediaEl])

  const pauseMedia = useCallback(() => {
    const el = getMediaEl()
    if (!el) return
    el.pause()
    setIsMediaPlaying(false)
  }, [getMediaEl])

  // ── Recording ─────────────────────────────────────────────────────────────
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
    } catch (e) {
      alert('Microphone access denied: ' + String(e))
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || !currentSegment) return
    mediaRecorderRef.current.stop()
    setIsRecording(false)
    await new Promise<void>((resolve) => setTimeout(resolve, 400))

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    if (blob.size === 0) { alert('Recording is empty — please try again.'); return }

    setTranscribing(true)
    try {
      const actualDuration = (Date.now() - recordingStartRef.current) / 1000
      const targetDuration = Math.max(1, currentSegment.end_time - currentSegment.start_time)
      const arrayBuffer = await blob.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)
      let base64 = ''
      for (let i = 0; i < uint8.length; i += 8192) {
        base64 += String.fromCharCode(...uint8.subarray(i, i + 8192))
      }
      base64 = btoa(base64)

      const recPath = await window.api.recording.save(base64, `rec_${Date.now()}.webm`)
      const result = await window.api.practice.transcribeRecording(
        recPath, currentSegment.original, targetDuration, actualDuration
      )
      setUserTranscript(result.userTranscript)
      setLastScores(result.scores)
      setRecordingPath(recPath)

      await window.api.practice.saveAttempt({
        segment_id: currentSegment.id,
        user_transcript: result.userTranscript,
        audio_path: recPath,
        accuracy_score: result.scores.accuracy_score,
        pronunciation_score: result.scores.pronunciation_score,
        rhythm_score: result.scores.rhythm_score,
        speed_score: result.scores.speed_score,
        overall_score: result.scores.overall_score,
        feedback: result.scores.feedback_text
      })
      await loadAttempts(currentSegment.id)
    } catch (e) {
      alert('Transcription error: ' + String(e))
    } finally {
      setTranscribing(false)
    }
  }, [currentSegment, loadAttempts])

  // ── Translation ───────────────────────────────────────────────────────────
  const handleTextSelect = useCallback(async () => {
    const text = window.getSelection()?.toString().trim()
    if (!text || text.length < 2) return
    setSelectedText(text)
    setTranslating(true)
    setTranslationResult('')
    try {
      setTranslationResult(await window.api.translate.interactive(text))
    } catch {
      setTranslationResult('Translation error')
    } finally {
      setTranslating(false)
    }
  }, [])

  // ── TTS ───────────────────────────────────────────────────────────────────
  const playTts = useCallback(async (text?: string) => {
    const t = text || currentSegment?.original
    if (!t || ttsPlaying) return
    setTtsPlaying(true)
    try {
      const result = await window.api.tts.speak(t)
      const audio = new Audio(`file://${result.path}`)
      ttsAudioRef.current = audio
      audio.onended = () => setTtsPlaying(false)
      audio.onerror = () => setTtsPlaying(false)
      await audio.play()
    } catch (e) {
      setTtsPlaying(false)
      console.error('TTS error:', e)
    }
  }, [currentSegment, ttsPlaying])

  // ── Flashcard ─────────────────────────────────────────────────────────────
  const showToast = useCallback((toast: FlashcardToast) => {
    if (flashcardToastTimerRef.current) clearTimeout(flashcardToastTimerRef.current)
    setFlashcardToast(toast)
    flashcardToastTimerRef.current = setTimeout(() => setFlashcardToast(null), 3000)
  }, [])

  const addToFlashcard = useCallback(async () => {
    if (!selectedText || !translationResult) return
    try {
      const exists = await window.api.flashcards.exists(selectedText)
      if (exists) {
        showToast({ msg: `"${selectedText}" already in flashcards`, type: 'exists' })
      } else {
        await window.api.flashcards.create({
          type: 'vocabulary',
          front: selectedText,
          back: translationResult,
          source_segment_id: currentSegment?.id || null,
          session_id: sessionId || null
        })
        showToast({ msg: `"${selectedText}" added to flashcards!`, type: 'success' })
      }
    } catch {
      showToast({ msg: 'Failed to add flashcard', type: 'error' })
    }
  }, [selectedText, translationResult, currentSegment?.id, sessionId, showToast])

  // ── Analysis ──────────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (!sessionId) return
    setAnalyzing(true)
    try {
      setAnalysisResult(await window.api.practice.analyzeSession(sessionId))
      setShowAnalysis(true)
    } catch (e) {
      alert('Analysis failed: ' + String(e))
    } finally {
      setAnalyzing(false)
    }
  }, [sessionId])

  const scoreColor = (score: number): string =>
    score >= 85 ? 'text-tertiary' : score >= 65 ? 'text-[#f59e0b]' : 'text-error'

  const completedCount = lastAttempts.length > 0 ? currentIdx + 1 : currentIdx
  const completionPct = segments.length > 0 ? Math.round((completedCount / segments.length) * 100) : 0

  void recordingPath

  if (!session || segments.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-5xl text-secondary animate-spin">refresh</span>
          <span className="text-secondary">Loading session...</span>
        </div>
      </div>
    )
  }

  const words = currentSegment?.original.split(/\s+/).filter(Boolean) ?? []

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Hidden audio element — only for sessions without a playable video file */}
      {!isPlayableVideo && <audio ref={audioRef} className="hidden" />}

      {/* Flashcard toast */}
      {flashcardToast && (
        <div className={`fixed top-20 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold ${
          flashcardToast.type === 'success' ? 'bg-tertiary text-white' :
          flashcardToast.type === 'exists'  ? 'bg-[#f59e0b] text-white' :
                                               'bg-error text-on-error'
        }`}>
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
            {flashcardToast.type === 'success' ? 'check_circle' : flashcardToast.type === 'exists' ? 'info' : 'error'}
          </span>
          {flashcardToast.msg}
        </div>
      )}

      {/* TOP APP BAR */}
      <header className="w-full h-16 shrink-0 flex justify-between items-center px-gutter bg-surface-container-lowest border-b border-outline-variant drag-region">
        <div className="flex items-center gap-4 no-drag">
          <nav className="flex gap-4 text-body-md items-center">
            <button onClick={() => navigate('/sessions')} className="text-on-surface-variant font-label-sm hover:text-primary transition-colors">
              Sessions
            </button>
            <span className="material-symbols-outlined text-outline-variant text-sm">chevron_right</span>
            <span className="text-on-surface font-bold truncate max-w-[300px]">{session.title}</span>
            <span className="bg-primary-fixed text-on-primary-fixed px-2 py-0.5 rounded text-[10px] font-bold">{completionPct}%</span>
          </nav>
        </div>
        <div className="flex items-center gap-4 no-drag">
          {/* View toggles */}
          <div className="hidden md:flex gap-1">
            {/* Transcript panel toggle */}
            <button
              onClick={() => setShowTranscript((v) => !v)}
              title={showTranscript ? 'Hide transcript panel' : 'Show transcript panel'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                showTranscript ? 'bg-surface-container text-on-surface' : 'text-secondary hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {showTranscript ? 'menu_open' : 'menu'}
              </span>
              <span className="hidden lg:inline">Transcript</span>
            </button>
            {/* Translation (Thai subtitle) toggle */}
            <button
              onClick={() => {
                setShowTranslation((v) => {
                  if (v) { setSelectedText(''); setTranslationResult('') }
                  return !v
                })
              }}
              title={showTranslation ? 'Hide Thai subtitle' : 'Show Thai subtitle'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                showTranslation ? 'bg-surface-container text-on-surface' : 'text-secondary hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">translate</span>
              <span className="hidden lg:inline">Translate</span>
            </button>
            {/* IPA toggle */}
            <button
              onClick={() => setShowIPA((v) => !v)}
              title={showIPA ? 'Hide IPA' : 'Show IPA'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                showIPA ? 'bg-surface-container text-on-surface' : 'text-secondary hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">abc</span>
              <span className="hidden lg:inline">IPA</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="flex items-center gap-1 text-secondary hover:text-primary transition-colors"
              title="Analyze session with AI"
            >
              <span className="material-symbols-outlined text-[20px]">{analyzing ? 'hourglass_empty' : 'analytics'}</span>
            </button>
            <button
              onClick={() => navigate('/sessions')}
              className="bg-primary text-on-primary px-4 py-1.5 rounded-lg font-bold text-label-sm active:opacity-80 transition-all"
            >
              Finish Session
            </button>
          </div>
        </div>
      </header>

      {/* ── PRACTICE AREA ───────────────────────────────────────────────── */}
      {/*
        Left column: overflow-hidden, pb-20 reserves space for fixed floating bar.
        The section (practice card) is flex-1 min-h-0 so it fills remaining height.
      */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT: Focus View */}
        <div className="flex-[3] min-w-0 flex flex-col overflow-hidden p-gutter gap-4 pb-20">

          {/* ── Video player card (YouTube / video file only) ── */}
          {showVideoPlayer && (
            <div className="flex-1 min-h-0 relative rounded-2xl overflow-hidden bg-on-surface shadow-md">
              {isPlayableVideo ? (
                /* Actual video element for local .mp4/.mov/etc AND YouTube with downloaded MP4 */
                <video
                  ref={videoRef}
                  src={localMedia ? `file://${localMedia}` : undefined}
                  poster={session.thumbnail || undefined}
                  className="absolute inset-0 w-full h-full object-contain"
                  playsInline
                />
              ) : isYouTube ? (
                /* YouTube audio-only fallback: show thumbnail */
                session.thumbnail
                  ? <img src={session.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-80" alt={session.title} />
                  : <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20" />
              ) : null}
              <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/60 to-transparent">
                <p className="text-white font-semibold text-sm truncate">{session.title}</p>
              </div>
              <button
                onClick={() => isMediaPlaying ? pauseMedia() : playSegment()}
                className="absolute inset-0 flex items-center justify-center group"
              >
                <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {isMediaPlaying ? 'pause' : 'play_arrow'}
                  </span>
                </div>
              </button>
              <div className="absolute bottom-0 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-black/60 to-transparent">
                <div className="relative h-1 w-full bg-white/30 rounded-full">
                  <div className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all" style={{ width: `${mediaProgress}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* ── FOCUS SENTENCE CARD ────────────────────────────────────────
              flex-1 min-h-0: fills remaining height after video player.
              overflow-hidden: children cannot push beyond its bounds.
          ── */}
          <section className="flex-1 min-h-0 flex flex-col bg-surface-container-lowest rounded-3xl border border-outline-variant shadow-sm overflow-hidden">

            {/* Fixed top: controls + sentence counter */}
            <div className="shrink-0 flex flex-col items-center gap-2 pt-4 px-6">
              <div className="flex gap-2 flex-wrap justify-center">
                <div className="flex items-center gap-2 px-3 py-1 bg-surface-container rounded-full text-secondary">
                  <span className="material-symbols-outlined text-sm">speed</span>
                  <select
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    className="bg-transparent text-label-sm font-semibold outline-none cursor-pointer"
                  >
                    {[0.5, 0.75, 1.0, 1.25, 1.5].map((s) => (
                      <option key={s} value={s}>{s}x</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setLooping((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors ${looping ? 'bg-primary text-on-primary' : 'bg-surface-container text-secondary'}`}
                >
                  <span className="material-symbols-outlined text-sm">repeat</span>
                  <span className="text-label-sm">Loop</span>
                </button>
                <button
                  onClick={() => setAutoPlay((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors ${autoPlay ? 'bg-secondary text-on-secondary' : 'bg-surface-container text-secondary'}`}
                >
                  <span className="material-symbols-outlined text-sm">play_circle</span>
                  <span className="text-label-sm">Auto</span>
                </button>
              </div>
              <div className="text-label-sm text-secondary">
                {currentIdx + 1} / {segments.length}
              </div>
            </div>

            {/* ── SENTENCE AREA ─────────────────────────────────────────────
                Outer div: flex centering container — hook sets font-size here.
                Inner div: flex-wrap word container — hook measures ITS scrollHeight
                vs outer's clientHeight (avoids content-center scrollHeight artifact).
            ── */}
            <div
              ref={sentenceBoxRef}
              className="flex-1 min-h-0 overflow-hidden flex items-center justify-center px-6 py-1"
            >
              <div
                className="flex flex-wrap justify-center gap-x-[0.35em] gap-y-[0.35em] cursor-text"
                onMouseUp={handleTextSelect}
              >
                {words.map((word, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <span className="font-medium text-on-surface border-b-4 border-transparent px-[0.1em] pb-[0.05em] hover:border-primary hover:bg-secondary-container/30 rounded-t-md transition-all select-text leading-tight">
                      {word}
                    </span>
                    {showIPA && (
                      <span className="font-ipa-label text-[0.5em] text-secondary mt-[0.2em] tracking-wider">
                        /{word.toLowerCase().replace(/[^a-z]/g, '')}/
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Fixed bottom: subtitle + controls (compact) ───────────────
                shrink-0: never collapses; all children visible always.
                Compact sizing keeps total height ≤ ~180px so sentence area
                retains adequate space even in 50/50 split on small screens.
            ── */}
            <div className="shrink-0 flex flex-col items-center gap-2 px-4 pb-3">

              {/* Thai translation — single line, truncated */}
              {showTranslation && currentSegment?.translate && (
                <p className="text-on-surface-variant italic opacity-75 text-[11px] text-center truncate max-w-full px-2">
                  "{currentSegment.translate}"
                </p>
              )}

              {/* Word translation popup */}
              {selectedText && (
                <div className="w-full max-w-lg px-3 py-1.5 bg-secondary-container rounded-xl flex items-center gap-2">
                  <span className="text-xs font-semibold text-primary shrink-0">{selectedText}</span>
                  <span className="text-outline-variant text-[10px]">→</span>
                  {translating ? (
                    <span className="text-[11px] text-secondary animate-pulse flex-1 text-left">Translating...</span>
                  ) : (
                    <span className="text-[11px] text-on-surface flex-1 text-left">{translationResult}</span>
                  )}
                  {!translating && translationResult && (
                    <button
                      onClick={() => playTts(selectedText)}
                      disabled={ttsPlaying}
                      title="Play pronunciation"
                      className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${ttsPlaying ? 'bg-tertiary text-white animate-pulse' : 'hover:bg-surface-container-high text-secondary'}`}
                    >
                      <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>record_voice_over</span>
                    </button>
                  )}
                  {!translating && translationResult && (
                    <button
                      onClick={addToFlashcard}
                      title="Add to flashcards"
                      className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-surface-container-high text-secondary hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">bookmark_add</span>
                    </button>
                  )}
                  <button onClick={() => { setSelectedText(''); setTranslationResult('') }} className="shrink-0 text-secondary hover:text-primary">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              )}

              {/* Last attempt feedback — ultra compact single row */}
              {lastScores && (
                <div className="w-full max-w-lg px-3 py-1.5 bg-tertiary-container/10 border border-tertiary-container/20 rounded-xl flex items-center gap-2">
                  <span className={`text-[11px] font-semibold flex items-center gap-1 shrink-0 ${scoreColor(lastScores.overall_score)}`}>
                    <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>stars</span>
                    {lastScores.overall_score}%
                  </span>
                  {userTranscript && (
                    <p className="text-on-surface-variant text-[10px] truncate flex-1">"{userTranscript}"</p>
                  )}
                  <div className="flex gap-2 text-[10px] shrink-0 ml-auto">
                    <span className={scoreColor(lastScores.accuracy_score)}>Acc {lastScores.accuracy_score}%</span>
                    <span className={scoreColor(lastScores.rhythm_score)}>Rhy {lastScores.rhythm_score}%</span>
                  </div>
                </div>
              )}

              {/* Waveform */}
              {isRecording && (
                <div className="flex items-end gap-0.5 h-4">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="waveform-bar" style={{ animationDelay: `${i * 0.07}s` }} />
                  ))}
                </div>
              )}

              {transcribing && (
                <div className="flex items-center gap-1.5 text-secondary text-[11px]">
                  <span className="material-symbols-outlined animate-spin text-[14px]">refresh</span>
                  Transcribing...
                </div>
              )}

              {/* Transport controls — compact w-9 h-9 buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                  className="w-9 h-9 rounded-full border-2 border-outline-variant flex items-center justify-center text-secondary hover:bg-surface-container transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-[20px]">skip_previous</span>
                </button>

                <button
                  onClick={() => isMediaPlaying ? pauseMedia() : playSegment()}
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                    isMediaPlaying ? 'border-primary bg-primary-fixed text-primary' : 'border-outline-variant text-secondary hover:bg-surface-container'
                  }`}
                  title="Play / Pause segment"
                >
                  <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: isMediaPlaying ? "'FILL' 1" : "'FILL' 0" }}>
                    {isMediaPlaying ? 'pause' : 'play_arrow'}
                  </span>
                </button>

                <button
                  onClick={() => playTts()}
                  disabled={ttsPlaying}
                  title="AI Voice"
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                    ttsPlaying ? 'border-tertiary bg-tertiary-container animate-pulse text-tertiary' : 'border-outline-variant text-secondary hover:bg-surface-container'
                  } disabled:opacity-60`}
                >
                  <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {ttsPlaying ? 'volume_up' : 'record_voice_over'}
                  </span>
                </button>

                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="px-5 py-2 bg-error text-on-error rounded-full flex items-center gap-1.5 shadow-md recording-active text-sm font-bold"
                  >
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    disabled={transcribing}
                    className="px-5 py-2 bg-primary text-on-primary rounded-full flex items-center gap-1.5 shadow-md hover:scale-105 active:scale-95 transition-all disabled:opacity-50 text-sm font-bold"
                  >
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
                    Record
                  </button>
                )}

                <button
                  onClick={() => setCurrentIdx((i) => Math.min(segments.length - 1, i + 1))}
                  disabled={currentIdx === segments.length - 1}
                  className="w-9 h-9 rounded-full border-2 border-outline-variant flex items-center justify-center text-secondary hover:bg-surface-container transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-[20px]">skip_next</span>
                </button>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-xs">
                <div className="relative h-1 bg-surface-container rounded-full">
                  <div className="absolute h-full bg-primary rounded-full transition-all" style={{ width: `${completionPct}%` }} />
                </div>
                <div className="flex justify-between mt-0.5 text-[10px] text-secondary font-mono">
                  <span>{currentIdx + 1}/{segments.length}</span>
                  <span>{completionPct}%</span>
                </div>
              </div>

            </div>{/* end fixed bottom */}
          </section>{/* end focus card */}
        </div>{/* end left column */}

        {/* RIGHT: Transcript panel — hidden when showTranscript = false */}
        <aside className={`flex-[1.2] min-w-[280px] max-w-[360px] bg-surface-container-lowest border-l border-outline-variant flex flex-col overflow-hidden transition-all ${showTranscript ? '' : 'hidden'}`}>
          <div className="p-4 shrink-0 border-b border-outline-variant flex items-center justify-between">
            <h2 className="font-bold text-on-surface">Full Transcript</h2>
            <span className="bg-tertiary text-white px-2 py-1 rounded text-[10px] font-bold">{completionPct}% Done</span>
          </div>

          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 no-scrollbar">
            {segments.map((seg, idx) => {
              const isActive = idx === currentIdx
              const isFuture = idx > currentIdx
              return (
                <div
                  key={seg.id}
                  data-active={String(isActive)}
                  onClick={() => !isFuture && setCurrentIdx(idx)}
                  className={`p-4 rounded-xl flex flex-col gap-2 transition-all ${
                    isActive   ? 'border-l-4 border-primary bg-secondary-container shadow-sm' :
                    isFuture   ? 'border border-outline-variant bg-white opacity-50 grayscale cursor-not-allowed' :
                                 'border border-outline-variant bg-white hover:border-primary/40 cursor-pointer'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`text-[10px] font-bold ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}>#{idx + 1}</span>
                    {isActive  && <span className="text-[10px] bg-primary text-on-primary px-2 py-0.5 rounded-full">ACTIVE</span>}
                    {isFuture  && <span className="material-symbols-outlined text-sm text-outline-variant">lock</span>}
                  </div>
                  <p className="font-transcript-en text-on-surface text-sm leading-relaxed">{seg.original}</p>
                  {showTranslation && seg.translate && (
                    <p className="text-xs text-on-surface-variant opacity-70">{seg.translate}</p>
                  )}
                  {isActive && lastScores && (
                    <span className={`font-ipa-label text-xs ${scoreColor(lastScores.overall_score)}`}>
                      {lastScores.overall_score}% accurate
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="p-4 shrink-0 border-t border-outline-variant bg-surface-container">
            <div className="flex justify-between text-label-sm text-on-surface-variant mb-2">
              <span>Session Progress</span>
              <span className="font-mono">{segments.length - currentIdx - 1} left</span>
            </div>
            <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        </aside>
      </div>

      {/* FLOATING CONTROLS */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-auto rounded-full px-3 py-1.5 bg-surface-container border border-outline-variant shadow-lg flex items-center gap-1 z-50">
        <select
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
          className="px-4 py-2 text-secondary bg-transparent rounded-full text-label-sm font-semibold outline-none cursor-pointer hover:bg-surface-container-high"
        >
          {[0.5, 0.75, 1.0, 1.25, 1.5].map((s) => <option key={s} value={s}>{s}x</option>)}
        </select>
        <button
          onClick={() => isMediaPlaying ? pauseMedia() : playSegment()}
          className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${isMediaPlaying ? 'text-primary' : 'text-secondary hover:bg-surface-container-high'}`}
        >
          <span className="material-symbols-outlined">{isMediaPlaying ? 'pause' : 'play_arrow'}</span>
          <span className="text-label-sm">{isMediaPlaying ? 'Pause' : 'Play'}</span>
        </button>
        <button
          onClick={() => setLooping((v) => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${looping ? 'bg-primary text-on-primary shadow-md' : 'text-secondary hover:bg-surface-container-high'}`}
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>repeat</span>
          <span className="text-label-sm">Loop</span>
        </button>
        <button
          onClick={() => setAutoPlay((v) => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${autoPlay ? 'bg-secondary text-on-secondary shadow-md' : 'text-secondary hover:bg-surface-container-high'}`}
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
          <span className="text-label-sm">Auto</span>
        </button>
        <button
          onClick={() => playTts()}
          disabled={ttsPlaying}
          className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${ttsPlaying ? 'text-tertiary animate-pulse' : 'text-secondary hover:bg-surface-container-high'} disabled:opacity-50`}
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>record_voice_over</span>
          <span className="text-label-sm">AI Voice</span>
        </button>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={transcribing}
          className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${isRecording ? 'text-error hover:bg-error-container/20' : 'text-secondary hover:bg-surface-container-high'} disabled:opacity-50`}
        >
          <span className="material-symbols-outlined">{isRecording ? 'stop' : 'mic'}</span>
          <span className="text-label-sm">{isRecording ? 'Stop' : 'Record'}</span>
        </button>
      </nav>

      {/* Analysis Modal */}
      {showAnalysis && analysisResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-[640px] max-h-[80vh] mx-4 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-outline-variant flex items-center justify-between">
              <h2 className="text-xl font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
                Session Analysis
              </h2>
              <button onClick={() => setShowAnalysis(false)} className="text-secondary hover:text-primary">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="overflow-y-auto p-6 flex flex-col gap-5">
              {(analysisResult as { analysis?: { summary?: { overall_feedback?: string; main_weaknesses?: string[] } } }).analysis?.summary && (
                <div className="p-4 bg-primary-fixed rounded-xl">
                  <p className="font-semibold text-on-surface mb-2">Overall Feedback</p>
                  <p className="text-sm text-on-surface-variant">
                    {(analysisResult as { analysis?: { summary?: { overall_feedback?: string } } }).analysis?.summary?.overall_feedback}
                  </p>
                  {(analysisResult as { analysis?: { summary?: { main_weaknesses?: string[] } } }).analysis?.summary?.main_weaknesses?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(analysisResult as { analysis?: { summary?: { main_weaknesses?: string[] } } }).analysis?.summary?.main_weaknesses?.map((w, i) => (
                        <span key={i} className="px-2 py-1 bg-white/60 rounded-full text-xs text-primary font-semibold">{w}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
              {(analysisResult as { flashcardsCreated?: number }).flashcardsCreated != null && (
                <div className="flex items-center gap-2 p-3 bg-tertiary-container/20 rounded-xl">
                  <span className="material-symbols-outlined text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>style</span>
                  <span className="text-sm text-on-surface">
                    {(analysisResult as { flashcardsCreated?: number }).flashcardsCreated} flashcards created
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
