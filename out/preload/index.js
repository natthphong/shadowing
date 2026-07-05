"use strict";
const electron = require("electron");
const api = {
  // Sessions
  sessions: {
    list: () => electron.ipcRenderer.invoke("session:list"),
    get: (id) => electron.ipcRenderer.invoke("session:get", id),
    delete: (id) => electron.ipcRenderer.invoke("session:delete", id),
    updateProgress: (id, data) => electron.ipcRenderer.invoke("session:update-progress", id, data),
    getAnalysis: (id) => electron.ipcRenderer.invoke("session:analysis:get", id)
  },
  // Import
  import: {
    youtube: (url) => electron.ipcRenderer.invoke("import:youtube", url),
    file: (path) => electron.ipcRenderer.invoke("import:file", path),
    transcript: (text, title) => electron.ipcRenderer.invoke("import:transcript", text, title),
    onProgress: (cb) => {
      electron.ipcRenderer.on("import:progress", (_e, data) => cb(data));
      return () => electron.ipcRenderer.removeAllListeners("import:progress");
    }
  },
  // Practice
  practice: {
    saveAttempt: (data) => electron.ipcRenderer.invoke("practice:attempt:save", data),
    transcribeRecording: (audioPath, original, targetDuration, actualDuration) => electron.ipcRenderer.invoke("practice:transcribe-recording", audioPath, original, targetDuration, actualDuration),
    getAttempts: (segmentId) => electron.ipcRenderer.invoke("practice:get-attempts", segmentId),
    analyzeSession: (sessionId) => electron.ipcRenderer.invoke("practice:session-analyze", sessionId),
    onAnalysisProgress: (cb) => {
      const listener = (_event, data) => cb(data);
      electron.ipcRenderer.on("analysis:progress", listener);
      return () => electron.ipcRenderer.removeListener("analysis:progress", listener);
    }
  },
  // Translation
  translate: {
    interactive: (text) => electron.ipcRenderer.invoke("translate:interactive", text),
    updateSegment: (id, translate) => electron.ipcRenderer.invoke("translate:segment:update", id, translate)
  },
  // Flashcards
  flashcards: {
    list: (type) => electron.ipcRenderer.invoke("flashcard:list", type),
    due: () => electron.ipcRenderer.invoke("flashcard:due"),
    review: (id, rating) => electron.ipcRenderer.invoke("flashcard:review", id, rating),
    create: (data) => electron.ipcRenderer.invoke("flashcard:create", data),
    exists: (front) => electron.ipcRenderer.invoke("flashcard:exists", front),
    delete: (id) => electron.ipcRenderer.invoke("flashcard:delete", id),
    deleteMany: (ids) => electron.ipcRenderer.invoke("flashcard:delete-many", ids),
    update: (id, data) => electron.ipcRenderer.invoke("flashcard:update", id, data),
    stats: () => electron.ipcRenderer.invoke("flashcard:stats")
  },
  // Speaking Q&A practice
  speaking: {
    sessions: () => electron.ipcRenderer.invoke("speaking:sessions"),
    generate: (sessionId, questionCount) => electron.ipcRenderer.invoke("speaking:generate", sessionId, questionCount),
    transcribe: (audioPath) => electron.ipcRenderer.invoke("speaking:transcribe", audioPath),
    evaluate: (questionId, transcript, audioPath) => electron.ipcRenderer.invoke("speaking:evaluate", questionId, transcript, audioPath),
    answers: (questionId) => electron.ipcRenderer.invoke("speaking:answers", questionId),
    history: () => electron.ipcRenderer.invoke("speaking:history"),
    onProgress: (cb) => {
      const listener = (_event, data) => cb(data);
      electron.ipcRenderer.on("speaking:progress", listener);
      return () => electron.ipcRenderer.removeListener("speaking:progress", listener);
    }
  },
  // Post-session exams
  exam: {
    getForSession: (sessionId) => electron.ipcRenderer.invoke("exam:session:get", sessionId),
    generate: (sessionId, questionCount = 7) => electron.ipcRenderer.invoke("exam:generate", sessionId, questionCount),
    submit: (quizId, answers) => electron.ipcRenderer.invoke("exam:submit", quizId, answers),
    getAttempt: (attemptId) => electron.ipcRenderer.invoke("exam:attempt:get", attemptId),
    history: () => electron.ipcRenderer.invoke("exam:history"),
    onProgress: (cb) => {
      const listener = (_event, data) => cb(data);
      electron.ipcRenderer.on("exam:progress", listener);
      return () => electron.ipcRenderer.removeListener("exam:progress", listener);
    }
  },
  // Dashboard
  dashboard: {
    stats: () => electron.ipcRenderer.invoke("dashboard:stats")
  },
  // Grammar & Vocabulary
  grammar: {
    list: () => electron.ipcRenderer.invoke("grammar:list"),
    chat: (grammarId, messages) => electron.ipcRenderer.invoke("grammar:chat", grammarId, messages)
  },
  vocabulary: {
    list: () => electron.ipcRenderer.invoke("vocabulary:list")
  },
  // Settings
  settings: {
    get: () => electron.ipcRenderer.invoke("settings:get"),
    set: (key, value) => electron.ipcRenderer.invoke("settings:set", key, value),
    setAll: (data) => electron.ipcRenderer.invoke("settings:set-all", data)
  },
  // Models
  models: {
    list: () => electron.ipcRenderer.invoke("models:list"),
    status: () => electron.ipcRenderer.invoke("models:status")
  },
  // Recording
  recording: {
    save: (base64, filename) => electron.ipcRenderer.invoke("recording:save", base64, filename)
  },
  // TTS
  tts: {
    speak: (text, voice) => electron.ipcRenderer.invoke("tts:speak", text, voice)
  },
  // File dialog
  dialog: {
    openFile: () => electron.ipcRenderer.invoke("dialog:open-file")
  },
  // Full data export / import
  data: {
    exportAll: () => electron.ipcRenderer.invoke("data:export"),
    importAll: () => electron.ipcRenderer.invoke("data:import"),
    onProgress: (cb) => {
      const listener = (_event, data) => cb(data);
      electron.ipcRenderer.on("data:progress", listener);
      return () => electron.ipcRenderer.removeListener("data:progress", listener);
    }
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
