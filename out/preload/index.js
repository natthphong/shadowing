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
      electron.ipcRenderer.on("analysis:progress", (_e, data) => cb(data));
      return () => electron.ipcRenderer.removeAllListeners("analysis:progress");
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
    stats: () => electron.ipcRenderer.invoke("flashcard:stats")
  },
  // Dashboard
  dashboard: {
    stats: () => electron.ipcRenderer.invoke("dashboard:stats")
  },
  // Grammar & Vocabulary
  grammar: {
    list: () => electron.ipcRenderer.invoke("grammar:list")
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
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
