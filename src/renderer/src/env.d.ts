/// <reference types="vite/client" />

interface Window {
  api: {
    sessions: {
      list: () => Promise<unknown[]>
      get: (id: string) => Promise<unknown>
      delete: (id: string) => Promise<boolean>
      updateProgress: (id: string, data: Record<string, unknown>) => Promise<boolean>
      getAnalysis: (id: string) => Promise<unknown>
    }
    import: {
      youtube: (url: string) => Promise<{ sessionId: string; title: string; segmentCount: number }>
      file: (path: string) => Promise<{ sessionId: string; title: string; segmentCount: number }>
      transcript: (text: string, title: string) => Promise<{ sessionId: string; title: string; segmentCount: number }>
      onProgress: (cb: (data: { step: string; detail: string; pct: number }) => void) => () => void
    }
    practice: {
      saveAttempt: (data: Record<string, unknown>) => Promise<{ id: string }>
      transcribeRecording: (
        audioPath: string,
        original: string,
        targetDuration: number,
        actualDuration: number
      ) => Promise<{ userTranscript: string; scores: import('./types').ScoreResult }>
      getAttempts: (segmentId: string) => Promise<unknown[]>
      analyzeSession: (sessionId: string) => Promise<unknown>
      onAnalysisProgress: (cb: (data: { status: string; msg: string }) => void) => () => void
    }
    translate: {
      interactive: (text: string) => Promise<string>
      updateSegment: (id: string, translate: string) => Promise<boolean>
    }
    flashcards: {
      list: (type?: string) => Promise<unknown[]>
      due: () => Promise<unknown[]>
      review: (id: string, rating: string) => Promise<boolean>
      create: (data: Record<string, unknown>) => Promise<{ id: string }>
      exists: (front: string) => Promise<boolean>
      delete: (id: string) => Promise<boolean>
      stats: () => Promise<unknown>
    }
    exam: {
      getForSession: (sessionId: string) => Promise<import('./types').ExamSessionData>
      generate: (sessionId: string, questionCount?: number) => Promise<import('./types').ExamQuiz>
      submit: (quizId: string, answers: Array<number | null>) => Promise<import('./types').ExamReview>
      getAttempt: (attemptId: string) => Promise<import('./types').ExamReview | null>
      history: () => Promise<import('./types').ExamHistoryEntry[]>
      onProgress: (cb: (data: { status: string; msg: string }) => void) => () => void
    }
    dashboard: {
      stats: () => Promise<unknown>
    }
    grammar: {
      list: () => Promise<unknown[]>
    }
    vocabulary: {
      list: () => Promise<unknown[]>
    }
    settings: {
      get: () => Promise<Record<string, string>>
      set: (key: string, value: string) => Promise<boolean>
      setAll: (data: Record<string, string>) => Promise<boolean>
    }
    models: {
      list: () => Promise<string[]>
      status: () => Promise<{ role: string; model: string; available: boolean }[]>
    }
    recording: {
      save: (base64: string, filename: string) => Promise<string>
    }
    tts: {
      speak: (text: string, voice?: string) => Promise<{ path: string }>
    }
    dialog: {
      openFile: () => Promise<string | null>
    }
  }
}
