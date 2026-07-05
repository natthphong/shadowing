import { useCallback, useEffect, useRef, useState } from 'react'
import { GrammarItem } from '../types'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  hidden?: boolean
}

// Bootstrap message sent once so the tutor opens the session with a first challenge
const BOOTSTRAP = "I'm ready. Please introduce this grammar briefly and give me the first challenge."

export default function GrammarPracticeChat({
  grammar,
  onClose
}: {
  grammar: GrammarItem
  onClose: () => void
}): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [ttsPlaying, setTtsPlaying] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  const send = useCallback(async (history: ChatMessage[]) => {
    setThinking(true)
    try {
      const payload = history.map(({ role, content }) => ({ role, content }))
      const { reply } = await window.api.grammar.chat(grammar.id, payload)
      setMessages([...history, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages([...history, { role: 'assistant', content: 'ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อ AI: ' + String(e) }])
    } finally {
      setThinking(false)
    }
  }, [grammar.id])

  // Kick off the session with a hidden bootstrap message
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void send([{ role: 'user', content: BOOTSTRAP, hidden: true }])
  }, [send])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || thinking) return
    setInput('')
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    void send(next)
  }, [input, messages, send, thinking])

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
    if (!mediaRecorderRef.current) return
    mediaRecorderRef.current.stop()
    setIsRecording(false)
    await new Promise<void>((resolve) => setTimeout(resolve, 400))

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    if (blob.size === 0) return

    setTranscribing(true)
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
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript))
    } catch (e) {
      alert('Transcription error: ' + String(e))
    } finally {
      setTranscribing(false)
    }
  }, [])

  const playTts = useCallback(async (text: string) => {
    // Speak only the English fragments of a mixed Thai/English tutor message
    const english = (text.match(/[A-Za-z][A-Za-z0-9' ,.!?-]*/g) || [])
      .map((s) => s.trim())
      .filter((s) => s.split(/\s+/).length >= 3)
      .join('. ')
    const target = english || text
    if (!target || ttsPlaying) return
    setTtsPlaying(true)
    try {
      const result = await window.api.tts.speak(target)
      const audio = new Audio(`file://${result.path}`)
      audio.onended = () => setTtsPlaying(false)
      audio.onerror = () => setTtsPlaying(false)
      await audio.play()
    } catch {
      setTtsPlaying(false)
    }
  }, [ttsPlaying])

  const visibleMessages = messages.filter((m) => !m.hidden)

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[680px] max-w-[calc(100vw-2rem)] h-[80vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="grammar-chat"
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 no-scrollbar bg-background">
          {visibleMessages.length === 0 && thinking && (
            <div className="flex items-center gap-2 text-secondary text-sm py-8 justify-center">
              <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              AI tutor is preparing your first challenge...
            </div>
          )}
          {visibleMessages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary text-on-primary rounded-br-md'
                  : 'bg-white border border-outline-variant text-on-surface rounded-bl-md'
              }`}>
                {msg.content}
                {msg.role === 'assistant' && (
                  <button
                    onClick={() => void playTts(msg.content)}
                    disabled={ttsPlaying}
                    title="Listen to the English parts"
                    className="mt-2 flex items-center gap-1 text-xs text-secondary hover:text-primary transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>volume_up</span>
                    Listen
                  </button>
                )}
              </div>
            </div>
          ))}
          {thinking && visibleMessages.length > 0 && (
            <div className="flex justify-start">
              <div className="p-3.5 rounded-2xl rounded-bl-md bg-white border border-outline-variant flex items-center gap-2 text-secondary text-sm">
                <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                Thinking...
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-outline-variant shrink-0 flex items-end gap-2">
          <button
            onClick={() => (isRecording ? void stopRecording() : void startRecording())}
            disabled={transcribing || thinking}
            title={isRecording ? 'Stop recording' : 'Answer by voice'}
            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all ${
              isRecording ? 'bg-error text-on-error recording-active' : 'bg-surface-container text-secondary hover:text-primary'
            } disabled:opacity-50`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              {isRecording ? 'stop' : transcribing ? 'hourglass_empty' : 'mic'}
            </span>
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            rows={1}
            placeholder={transcribing ? 'Transcribing your voice...' : 'Answer in English... (Enter to send)'}
            className="flex-1 px-4 py-3 rounded-2xl border border-outline-variant bg-white text-sm outline-none focus:border-primary resize-none max-h-32"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || thinking}
            className="w-11 h-11 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
          </button>
        </div>
      </div>
    </div>
  )
}
