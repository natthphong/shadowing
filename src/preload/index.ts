import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Sessions
  sessions: {
    list: () => ipcRenderer.invoke('session:list'),
    get: (id: string) => ipcRenderer.invoke('session:get', id),
    delete: (id: string) => ipcRenderer.invoke('session:delete', id),
    updateProgress: (id: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke('session:update-progress', id, data),
    getAnalysis: (id: string) => ipcRenderer.invoke('session:analysis:get', id)
  },

  // Import
  import: {
    youtube: (url: string) => ipcRenderer.invoke('import:youtube', url),
    file: (path: string) => ipcRenderer.invoke('import:file', path),
    transcript: (text: string, title: string) => ipcRenderer.invoke('import:transcript', text, title),
    onProgress: (cb: (data: { step: string; detail: string; pct: number }) => void) => {
      ipcRenderer.on('import:progress', (_e, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('import:progress')
    }
  },

  // Practice
  practice: {
    saveAttempt: (data: Record<string, unknown>) =>
      ipcRenderer.invoke('practice:attempt:save', data),
    transcribeRecording: (
      audioPath: string,
      original: string,
      targetDuration: number,
      actualDuration: number
    ) => ipcRenderer.invoke('practice:transcribe-recording', audioPath, original, targetDuration, actualDuration),
    getAttempts: (segmentId: string) => ipcRenderer.invoke('practice:get-attempts', segmentId),
    analyzeSession: (sessionId: string) =>
      ipcRenderer.invoke('practice:session-analyze', sessionId),
    onAnalysisProgress: (cb: (data: { status: string; msg: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { status: string; msg: string }): void => cb(data)
      ipcRenderer.on('analysis:progress', listener)
      return () => ipcRenderer.removeListener('analysis:progress', listener)
    }
  },

  // Translation
  translate: {
    interactive: (text: string) => ipcRenderer.invoke('translate:interactive', text),
    updateSegment: (id: string, translate: string) =>
      ipcRenderer.invoke('translate:segment:update', id, translate)
  },

  // Flashcards
  flashcards: {
    list: (type?: string) => ipcRenderer.invoke('flashcard:list', type),
    due: () => ipcRenderer.invoke('flashcard:due'),
    review: (id: string, rating: string) => ipcRenderer.invoke('flashcard:review', id, rating),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('flashcard:create', data),
    exists: (front: string) => ipcRenderer.invoke('flashcard:exists', front),
    delete: (id: string) => ipcRenderer.invoke('flashcard:delete', id),
    stats: () => ipcRenderer.invoke('flashcard:stats')
  },

  // Post-session exams
  exam: {
    getForSession: (sessionId: string) => ipcRenderer.invoke('exam:session:get', sessionId),
    generate: (sessionId: string, questionCount = 7) => ipcRenderer.invoke('exam:generate', sessionId, questionCount),
    submit: (quizId: string, answers: Array<number | null>) => ipcRenderer.invoke('exam:submit', quizId, answers),
    getAttempt: (attemptId: string) => ipcRenderer.invoke('exam:attempt:get', attemptId),
    history: () => ipcRenderer.invoke('exam:history'),
    onProgress: (cb: (data: { status: string; msg: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { status: string; msg: string }): void => cb(data)
      ipcRenderer.on('exam:progress', listener)
      return () => ipcRenderer.removeListener('exam:progress', listener)
    }
  },

  // Dashboard
  dashboard: {
    stats: () => ipcRenderer.invoke('dashboard:stats')
  },

  // Grammar & Vocabulary
  grammar: {
    list: () => ipcRenderer.invoke('grammar:list')
  },
  vocabulary: {
    list: () => ipcRenderer.invoke('vocabulary:list')
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    setAll: (data: Record<string, string>) => ipcRenderer.invoke('settings:set-all', data)
  },

  // Models
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    status: () => ipcRenderer.invoke('models:status')
  },

  // Recording
  recording: {
    save: (base64: string, filename: string) => ipcRenderer.invoke('recording:save', base64, filename)
  },

  // TTS
  tts: {
    speak: (text: string, voice?: string) => ipcRenderer.invoke('tts:speak', text, voice)
  },

  // File dialog
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:open-file')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
