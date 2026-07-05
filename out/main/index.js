"use strict";
const electron = require("electron");
const path = require("path");
const log = require("electron-log");
const Database = require("better-sqlite3");
const fs = require("fs");
const uuid = require("uuid");
const os = require("os");
const child_process = require("child_process");
const crypto = require("crypto");
const is = {
  dev: !electron.app.isPackaged
};
const platform = {
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
};
const electronApp = {
  setAppUserModelId(id) {
    if (platform.isWindows)
      electron.app.setAppUserModelId(is.dev ? process.execPath : id);
  },
  setAutoLaunch(auto) {
    if (platform.isLinux)
      return false;
    const isOpenAtLogin = () => {
      return electron.app.getLoginItemSettings().openAtLogin;
    };
    if (isOpenAtLogin() !== auto) {
      electron.app.setLoginItemSettings({
        openAtLogin: auto,
        path: process.execPath
      });
      return isOpenAtLogin() === auto;
    } else {
      return true;
    }
  },
  skipProxy() {
    return electron.session.defaultSession.setProxy({ mode: "direct" });
  }
};
const optimizer = {
  watchWindowShortcuts(window, shortcutOptions) {
    if (!window)
      return;
    const { webContents } = window;
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {};
    webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown") {
        if (!is.dev) {
          if (input.code === "KeyR" && (input.control || input.meta))
            event.preventDefault();
        } else {
          if (input.code === "F12") {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools();
            } else {
              webContents.openDevTools({ mode: "undocked" });
              console.log("Open dev tool...");
            }
          }
        }
        if (escToCloseWindow) {
          if (input.code === "Escape" && input.key !== "Process") {
            window.close();
            event.preventDefault();
          }
        }
        if (!zoom) {
          if (input.code === "Minus" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "Equal" && input.shift && (input.control || input.meta))
            event.preventDefault();
        }
      }
    });
  },
  registerFramelessWindowIpc() {
    electron.ipcMain.on("win:invoke", (event, action) => {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (action === "show") {
          win.show();
        } else if (action === "showInactive") {
          win.showInactive();
        } else if (action === "min") {
          win.minimize();
        } else if (action === "max") {
          const isMaximized = win.isMaximized();
          if (isMaximized) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        } else if (action === "close") {
          win.close();
        }
      }
    });
  }
};
let db;
function getDb() {
  return db;
}
function initDatabase() {
  const userDataPath = electron.app.getPath("userData");
  const dbPath = path.join(userDataPath, "daily-speaking.db");
  log.info("DB path:", dbPath);
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT,
      url TEXT,
      local_media_path TEXT,
      thumbnail TEXT,
      duration_seconds REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      title TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      completion_percentage REAL DEFAULT 0,
      practice_duration_seconds INTEGER DEFAULT 0,
      total_segments INTEGER DEFAULT 0,
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS segments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      original TEXT NOT NULL,
      translate TEXT,
      start_time REAL DEFAULT 0,
      end_time REAL DEFAULT 0,
      duration REAL DEFAULT 0,
      word_timestamps TEXT,
      translation_model TEXT,
      transcription_model TEXT,
      position INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS practice_attempts (
      id TEXT PRIMARY KEY,
      segment_id TEXT NOT NULL,
      user_transcript TEXT,
      audio_path TEXT,
      accuracy_score REAL DEFAULT 0,
      pronunciation_score REAL DEFAULT 0,
      rhythm_score REAL DEFAULT 0,
      speed_score REAL DEFAULT 0,
      overall_score REAL DEFAULT 0,
      feedback TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS flashcards (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      source_segment_id TEXT,
      session_id TEXT,
      difficulty TEXT DEFAULT 'normal',
      interval_days REAL DEFAULT 1,
      ease_factor REAL DEFAULT 2.5,
      next_due_at TEXT,
      last_reviewed_at TEXT,
      review_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      FOREIGN KEY (source_segment_id) REFERENCES segments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS review_history (
      id TEXT PRIMARY KEY,
      flashcard_id TEXT NOT NULL,
      rating TEXT NOT NULL,
      score REAL,
      reviewed_at TEXT NOT NULL,
      FOREIGN KEY (flashcard_id) REFERENCES flashcards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vocabulary_items (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      translate TEXT,
      source_session_id TEXT,
      source_segment_id TEXT,
      reason TEXT,
      priority TEXT DEFAULT 'normal',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS grammar_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      pattern TEXT,
      explanation_th TEXT,
      examples TEXT DEFAULT '[]',
      last_seen_at TEXT,
      source_sessions TEXT DEFAULT '[]',
      review_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS session_analysis (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      summary TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_quizzes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      questions TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      model TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      answers TEXT NOT NULL,
      correct_count INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      score REAL NOT NULL,
      completed_at TEXT NOT NULL,
      FOREIGN KEY (quiz_id) REFERENCES session_quizzes(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_session_quizzes_session ON session_quizzes(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_session ON quiz_attempts(session_id, completed_at DESC);

    CREATE TABLE IF NOT EXISTS speaking_questions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      question_en TEXT NOT NULL,
      question_th TEXT,
      position INTEGER NOT NULL,
      batch_id TEXT,
      model TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS speaking_answers (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      transcript TEXT NOT NULL,
      audio_path TEXT,
      score REAL DEFAULT 0,
      grammar_ok INTEGER DEFAULT 0,
      feedback_th TEXT,
      suggested_answer TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (question_id) REFERENCES speaking_questions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_speaking_questions_session ON speaking_questions(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_speaking_answers_question ON speaking_answers(question_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS translation_cache (
      word TEXT PRIMARY KEY,
      translation TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings VALUES ('ollama_base_url', 'http://localhost:11434');
    INSERT OR IGNORE INTO settings VALUES ('whisper_model', 'mlx-community/whisper-large-v3-turbo');
    INSERT OR IGNORE INTO settings VALUES ('bulk_translate_model', 'scb10x/typhoon-translate1.5-4b');
    INSERT OR IGNORE INTO settings VALUES ('interactive_translate_model', 'scb10x/typhoon-translate1.5-4b');
    INSERT OR IGNORE INTO settings VALUES ('analysis_model', 'qwen3.5:9b');
    INSERT OR IGNORE INTO settings VALUES ('embedding_model', 'bge-m3');
    INSERT OR IGNORE INTO settings VALUES ('tts_model', 'legraphista/Orpheus:latest');
    INSERT OR IGNORE INTO settings VALUES ('low_score_threshold', '70');
    INSERT OR IGNORE INTO settings VALUES ('translate_workers', '2');
    INSERT OR IGNORE INTO settings VALUES ('max_due_cards', '30');
    INSERT OR IGNORE INTO settings VALUES ('gemini_api_key', '');
    INSERT OR IGNORE INTO settings VALUES ('analysis_provider', 'local');
    INSERT OR IGNORE INTO settings VALUES ('translate_provider', 'local');
    INSERT OR IGNORE INTO settings VALUES ('tts_provider', 'local');
    INSERT OR IGNORE INTO settings VALUES ('gemini_analysis_model', 'gemini-3.1-flash-lite');
    INSERT OR IGNORE INTO settings VALUES ('gemini_translate_model', 'gemini-3.1-flash-lite');
    INSERT OR IGNORE INTO settings VALUES ('gemini_tts_model', 'gemini-3.1-flash-tts-preview');
    INSERT OR IGNORE INTO settings VALUES ('gemini_tts_voice', 'Kore');
  `);
  log.info("Database initialized");
}
function closeDatabase() {
  if (db && db.open) {
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
  }
}
function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value ?? null;
}
function setSetting(key, value) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}
function getMediaDir() {
  const dir = path.join(electron.app.getPath("userData"), "media");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getRecordingsDir() {
  const dir = path.join(electron.app.getPath("userData"), "recordings");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getTtsCacheDir() {
  const dir = path.join(electron.app.getPath("userData"), "tts_cache");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function getCachedTranslation(word) {
  const row = db.prepare("SELECT translation FROM translation_cache WHERE word = ?").get(word);
  return row?.translation ?? null;
}
function setCachedTranslation(word, translation) {
  db.prepare("INSERT OR REPLACE INTO translation_cache (word, translation, created_at) VALUES (?, ?, ?)").run(
    word,
    translation,
    (/* @__PURE__ */ new Date()).toISOString()
  );
}
function registerSessionHandlers() {
  electron.ipcMain.handle("session:list", () => {
    const db2 = getDb();
    return db2.prepare(
      `SELECT s.*, src.type as source_type, src.url, src.thumbnail,
                (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.session_id = s.id) as exam_attempt_count,
                EXISTS(SELECT 1 FROM session_quizzes sq WHERE sq.session_id = s.id) as has_exam
         FROM sessions s
         LEFT JOIN sources src ON s.source_id = src.id
         ORDER BY s.created_at DESC`
    ).all();
  });
  electron.ipcMain.handle("session:get", (_e, sessionId) => {
    const db2 = getDb();
    const session = db2.prepare(
      `SELECT s.*, src.type as source_type, src.url, src.thumbnail, src.local_media_path
         FROM sessions s LEFT JOIN sources src ON s.source_id = src.id
         WHERE s.id = ?`
    ).get(sessionId);
    if (!session) return null;
    const segments = db2.prepare("SELECT * FROM segments WHERE session_id = ? ORDER BY position").all(sessionId);
    const attempts = db2.prepare(
      `SELECT pa.* FROM practice_attempts pa
         JOIN segments seg ON pa.segment_id = seg.id
         WHERE seg.session_id = ?
         ORDER BY pa.created_at DESC`
    ).all(sessionId);
    return { ...session, segments, attempts };
  });
  electron.ipcMain.handle("session:delete", (_e, sessionId) => {
    const db2 = getDb();
    db2.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return true;
  });
  electron.ipcMain.handle("session:update-progress", (_e, sessionId, data) => {
    const db2 = getDb();
    const current = db2.prepare("SELECT completion_percentage, practice_duration_seconds, completed_at FROM sessions WHERE id = ?").get(sessionId);
    if (!current) return false;
    const requestedCompletion = typeof data.completion_percentage === "number" ? Math.max(0, Math.min(100, data.completion_percentage)) : current.completion_percentage;
    const completion = Math.max(current.completion_percentage, requestedCompletion);
    const duration = typeof data.practice_duration_seconds === "number" ? Math.max(current.practice_duration_seconds, Math.round(data.practice_duration_seconds)) : current.practice_duration_seconds;
    const completedAt = current.completed_at || (completion >= 100 ? data.completed_at || (/* @__PURE__ */ new Date()).toISOString() : null);
    db2.prepare(`
      UPDATE sessions
      SET completion_percentage = ?, practice_duration_seconds = ?, completed_at = ?
      WHERE id = ?
    `).run(completion, duration, completedAt, sessionId);
    return true;
  });
  electron.ipcMain.handle("session:analysis:get", (_e, sessionId) => {
    return getDb().prepare("SELECT * FROM session_analysis WHERE session_id = ? ORDER BY created_at DESC LIMIT 1").get(sessionId);
  });
}
const HOMEBREW_BIN = process.arch === "arm64" ? "/opt/homebrew/bin" : "/usr/local/bin";
const USR_LOCAL_BIN = "/usr/local/bin";
const CHILD_ENV = {
  ...process.env,
  PATH: [
    HOMEBREW_BIN,
    USR_LOCAL_BIN,
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    process.env.PATH || ""
  ].join(":"),
  HOME: process.env.HOME || os.homedir()
};
const FFMPEG_PATH = `${HOMEBREW_BIN}/ffmpeg`;
const FFPROBE_PATH = `${HOMEBREW_BIN}/ffprobe`;
const YTDLP_PATH = `${HOMEBREW_BIN}/yt-dlp`;
const PYTHON3_PATH = `${HOMEBREW_BIN}/python3`;
function getScriptPath() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "whisper_transcribe.py");
  }
  return path.join(__dirname, "../../resources/whisper_transcribe.py");
}
async function transcribeAudio(audioPath, onProgress) {
  const model = getSetting("whisper_model") || "mlx-community/whisper-large-v3-turbo";
  const scriptPath = getScriptPath();
  log.info("Whisper script path:", scriptPath);
  log.info("Audio path:", audioPath);
  log.info("Model:", model);
  return new Promise((resolve, reject) => {
    onProgress?.("Starting Whisper transcription...");
    const proc = child_process.spawn(PYTHON3_PATH, [scriptPath, audioPath, model], {
      env: CHILD_ENV
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg) {
        log.info("Whisper:", msg);
        onProgress?.(msg.slice(0, 120));
      }
      stderr += msg;
    });
    proc.on("close", (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Whisper output: ${e}
Raw: ${stdout.slice(0, 300)}`));
        }
      } else {
        reject(new Error(`Whisper failed (code ${code}): ${stderr.slice(-500)}`));
      }
    });
    proc.on("error", (e) => {
      reject(new Error(`Cannot run python3 (${PYTHON3_PATH}): ${e.message}`));
    });
  });
}
function segmentizeTranscript(result) {
  const MAX_CHARS = 120;
  const MAX_DURATION = 10;
  const shortEnough = result.segments.every(
    (s) => s.text.trim().length <= MAX_CHARS && s.end - s.start <= MAX_DURATION
  );
  if (shortEnough && result.segments.length > 0) {
    return result.segments.map((s, i) => ({ ...s, id: i, text: s.text.trim() }));
  }
  const segments = [];
  let buffer = "";
  let bufStart = 0;
  let bufEnd = 0;
  let wordBuf = [];
  let segId = 0;
  function flush() {
    const text = buffer.trim();
    if (!text) return;
    segments.push({ id: segId++, start: bufStart, end: bufEnd, text, words: wordBuf.slice() });
    buffer = "";
    wordBuf = [];
  }
  for (const seg of result.segments) {
    const sentences = seg.text.split(/(?<=[.!?])\s+/);
    for (const sent of sentences) {
      const trimmed = sent.trim();
      if (!trimmed) continue;
      const wouldBeLen = buffer.length + (buffer ? " " : "") + trimmed.length;
      const wouldBeDur = seg.end - bufStart;
      if (buffer && (wouldBeLen > MAX_CHARS || wouldBeDur > MAX_DURATION)) {
        flush();
        bufStart = seg.start;
      }
      if (!buffer) bufStart = seg.start;
      buffer = buffer ? `${buffer} ${trimmed}` : trimmed;
      bufEnd = seg.end;
      if (seg.words) wordBuf.push(...seg.words);
    }
  }
  flush();
  return segments;
}
async function extractAudio(inputPath, outputDir, onProgress) {
  const outPath = path.join(outputDir, `audio_${Date.now()}.wav`);
  log.info("Extracting audio from", inputPath, "→", outPath);
  return new Promise((resolve, reject) => {
    onProgress?.("Extracting audio...");
    const proc = child_process.spawn(FFMPEG_PATH, [
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-y",
      outPath
    ], { env: CHILD_ENV });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      const msg = d.toString();
      stderr += msg;
      const match = msg.match(/time=(\d+:\d+:\d+)/);
      if (match) onProgress?.(`Extracting audio: ${match[1]}`);
    });
    proc.on("close", (code) => {
      if (code === 0) {
        log.info("Audio extracted:", outPath);
        resolve(outPath);
      } else {
        reject(new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-400)}`));
      }
    });
    proc.on("error", (e) => reject(new Error(`Cannot run ffmpeg (${FFMPEG_PATH}): ${e.message}`)));
  });
}
async function getMediaDuration(filePath) {
  return new Promise((resolve) => {
    const proc = child_process.spawn(FFPROBE_PATH, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      filePath
    ], { env: CHILD_ENV });
    let out = "";
    proc.stdout.on("data", (d) => out += d.toString());
    proc.on("close", () => {
      try {
        const data = JSON.parse(out);
        resolve(parseFloat(data.format.duration));
      } catch {
        resolve(0);
      }
    });
    proc.on("error", () => resolve(0));
  });
}
async function fetchYtMetadata(url) {
  return new Promise((resolve, reject) => {
    const proc = child_process.spawn(YTDLP_PATH, [
      "--dump-json",
      "--no-playlist",
      "--extractor-args",
      "youtube:player_client=android,ios",
      url
    ], { env: CHILD_ENV });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => out += d.toString());
    proc.stderr.on("data", (d) => err += d.toString());
    proc.on("close", (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(new Error("Invalid yt-dlp output"));
        }
      } else {
        reject(new Error(`yt-dlp failed: ${err.slice(-400)}`));
      }
    });
    proc.on("error", (e) => reject(new Error(`yt-dlp not found: ${e.message}`)));
  });
}
async function downloadYtVideo(url, outputDir, onProgress) {
  const outTemplate = path.join(outputDir, "yt_vid_%(id)s.%(ext)s");
  return new Promise((resolve, reject) => {
    onProgress?.("Downloading video from YouTube...");
    log.info("[yt-dlp video] Starting download:", url);
    const proc = child_process.spawn(YTDLP_PATH, [
      "-f",
      "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[ext=mp4]/best",
      "--merge-output-format",
      "mp4",
      "--ffmpeg-location",
      FFMPEG_PATH,
      "--extractor-args",
      "youtube:player_client=android,ios",
      "--no-playlist",
      "--no-mtime",
      "-o",
      outTemplate,
      "--print",
      "after_move:filepath",
      url
    ], { env: CHILD_ENV });
    let lastLine = "";
    let err = "";
    proc.stdout.on("data", (d) => {
      const line = d.toString().trim();
      if (line) {
        lastLine = line;
        log.info("[yt-dlp video] stdout:", line);
      }
    });
    proc.stderr.on("data", (d) => {
      const msg = d.toString();
      err += msg;
      const pct = msg.match(/(\d+\.?\d*)%/);
      if (pct) onProgress?.(`Downloading video: ${parseFloat(pct[1]).toFixed(0)}%`);
    });
    proc.on("close", (code) => {
      if (code === 0 && lastLine) resolve(lastLine.trim());
      else if (code === 0) reject(new Error("yt-dlp video: no output path received"));
      else reject(new Error(`yt-dlp video failed (code ${code}): ${err.slice(-400)}`));
    });
    proc.on("error", (e) => reject(new Error(`Cannot run yt-dlp: ${e.message}`)));
  });
}
async function downloadYtAudio(url, outputDir, onProgress) {
  const outTemplate = path.join(outputDir, "yt_%(id)s.%(ext)s");
  return new Promise((resolve, reject) => {
    onProgress?.("Downloading audio from YouTube...");
    log.info("Starting yt-dlp download:", url);
    const proc = child_process.spawn(YTDLP_PATH, [
      "-x",
      "--audio-format",
      "wav",
      "--audio-quality",
      "0",
      "--postprocessor-args",
      `ffmpeg:-ar 16000 -ac 1`,
      "--ffmpeg-location",
      FFMPEG_PATH,
      "--extractor-args",
      "youtube:player_client=android,ios",
      "--no-playlist",
      "-o",
      outTemplate,
      "--print",
      "after_move:filepath",
      "--no-mtime",
      url
    ], { env: CHILD_ENV });
    let lastLine = "";
    let err = "";
    proc.stdout.on("data", (d) => {
      const line = d.toString().trim();
      if (line) {
        lastLine = line;
        log.info("yt-dlp stdout:", line);
      }
    });
    proc.stderr.on("data", (d) => {
      const msg = d.toString();
      err += msg;
      const pct = msg.match(/(\d+\.\d+)%/);
      if (pct) onProgress?.(`Downloading: ${pct[1]}%`);
      const speed = msg.match(/at\s+([\d.]+\w+\/s)/);
      if (speed) onProgress?.(`Downloading... ${speed[1]}`);
    });
    proc.on("close", (code) => {
      log.info("yt-dlp exit code:", code, "lastLine:", lastLine);
      if (code === 0 && lastLine) {
        resolve(lastLine);
      } else if (code === 0) {
        reject(new Error("yt-dlp finished but no output file path received"));
      } else {
        reject(new Error(`yt-dlp failed (code ${code}): ${err.slice(-600)}`));
      }
    });
    proc.on("error", (e) => reject(new Error(`Cannot run yt-dlp (${YTDLP_PATH}): ${e.message}`)));
  });
}
function baseUrl() {
  return getSetting("ollama_base_url") || "http://localhost:11434";
}
async function ollamaGenerate(model, prompt, options) {
  const url = `${baseUrl()}/api/generate`;
  const body = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: options?.temperature ?? 0.3,
      num_ctx: options?.num_ctx ?? 4096
    }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.response.trim();
}
async function ollamaChat(model, messages, options) {
  const url = `${baseUrl()}/api/chat`;
  const body = {
    model,
    messages,
    stream: false,
    options: {
      temperature: options?.temperature,
      num_ctx: options?.num_ctx
    },
    think: false
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Ollama chat error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.message.content.trim();
}
async function listModels() {
  try {
    const res = await fetch(`${baseUrl()}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.models.map((m) => m.name);
  } catch {
    return [];
  }
}
function extractJSON(text) {
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const start = Math.min(
    text.indexOf("[") === -1 ? Infinity : text.indexOf("["),
    text.indexOf("{") === -1 ? Infinity : text.indexOf("{")
  );
  if (start === Infinity) throw new Error("No JSON found");
  const openChar = text[start];
  const closeChar = openChar === "[" ? "]" : "}";
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === openChar) depth++;
    else if (text[i] === closeChar) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error("Unmatched JSON");
  return text.slice(start, end + 1);
}
const GEMINI_DEFAULTS = {
  analysis: "gemini-3.1-flash-lite",
  translate: "gemini-3.1-flash-lite",
  tts: "gemini-3.1-flash-tts-preview"
};
const PROVIDER_KEYS = {
  analysis: "analysis_provider",
  translate: "translate_provider",
  tts: "tts_provider"
};
const GEMINI_MODEL_KEYS = {
  analysis: "gemini_analysis_model",
  translate: "gemini_translate_model",
  tts: "gemini_tts_model"
};
const LOCAL_MODEL_KEYS = {
  analysis: { key: "analysis_model", fallback: "qwen3.6:27b" },
  translate: { key: "interactive_translate_model", fallback: "scb10x/typhoon-translate1.5-4b" },
  tts: { key: "tts_model", fallback: "legraphista/Orpheus:latest" }
};
function resolveRoute(role, get) {
  const provider = (get(PROVIDER_KEYS[role]) || "local").trim();
  const apiKey = (get("gemini_api_key") || "").trim();
  if (provider === "gemini" && apiKey) {
    const model = (get(GEMINI_MODEL_KEYS[role]) || "").trim() || GEMINI_DEFAULTS[role];
    return { provider: "gemini", model };
  }
  const local = LOCAL_MODEL_KEYS[role];
  return { provider: "local", model: (get(local.key) || "").trim() || local.fallback };
}
function buildGeminiGenerateBody(prompt, options) {
  return {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: options?.temperature ?? 0.3 }
  };
}
function buildGeminiChatBody(messages, options) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  const body = {
    contents,
    generationConfig: { temperature: options?.temperature }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return body;
}
function buildGeminiTtsBody(text, voice = "Kore") {
  return {
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
    }
  };
}
function parseGeminiText(json) {
  const data = json;
  if (data.error?.message) throw new Error(`Gemini error: ${data.error.message}`);
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned no text");
  return text;
}
function parseGeminiAudio(json) {
  const data = json;
  if (data.error?.message) throw new Error(`Gemini error: ${data.error.message}`);
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("Gemini returned no audio");
  return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType || "audio/pcm" };
}
function sampleRateFromMime(mimeType) {
  const match = /rate=(\d+)/.exec(mimeType);
  return match ? parseInt(match[1], 10) : 24e3;
}
function pcmToWav(pcm, sampleRate = 24e3) {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
async function callGemini(model, body) {
  const apiKey = (getSetting("gemini_api_key") || "").trim();
  if (!apiKey) throw new Error("Gemini API key is not configured");
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error?.message;
    throw new Error(`Gemini HTTP ${res.status}: ${message || "request failed"}`);
  }
  return json;
}
async function geminiGenerate(model, prompt, options) {
  const json = await callGemini(model, buildGeminiGenerateBody(prompt, options));
  return parseGeminiText(json);
}
async function geminiChat(model, messages, options) {
  const json = await callGemini(model, buildGeminiChatBody(messages, options));
  return parseGeminiText(json);
}
async function geminiTts(model, text, voice = "Kore") {
  const json = await callGemini(model, buildGeminiTtsBody(text, voice));
  const { base64, mimeType } = parseGeminiAudio(json);
  const pcm = Buffer.from(base64, "base64");
  if (/wav|x-wav/.test(mimeType)) return pcm;
  const wav = pcmToWav(pcm, sampleRateFromMime(mimeType));
  log.info(`Gemini TTS: ${pcm.length} bytes PCM (${mimeType}) → wav`);
  return wav;
}
function routeFor(role) {
  return resolveRoute(role, getSetting);
}
async function aiGenerate(role, prompt, options) {
  const route = resolveRoute(role, getSetting);
  if (route.provider === "gemini") {
    return geminiGenerate(route.model, prompt, { temperature: options?.temperature });
  }
  return ollamaGenerate(route.model, prompt, options);
}
async function aiChat(role, messages, options) {
  const route = resolveRoute(role, getSetting);
  if (route.provider === "gemini") {
    return geminiChat(route.model, messages, { temperature: options?.temperature });
  }
  return ollamaChat(route.model, messages, options);
}
async function translateOne(seg) {
  const prompt = `Translate to Thai. Reply with ONLY the Thai translation, no explanation, no markdown.

${seg.original}

Thai:`;
  try {
    const raw = await aiGenerate("translate", prompt, { temperature: 0.1 });
    const translation = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^Thai:\s*/i, "").trim();
    return { ...seg, translate: translation };
  } catch (e) {
    log.warn(`Segment translate failed (${seg.id}):`, e);
    return { ...seg, translate: "" };
  }
}
async function bulkTranslateSegments(segments, onProgress) {
  const route = resolveRoute("translate", getSetting);
  const workerCount = Math.max(1, parseInt(getSetting("translate_workers") || "2", 10));
  const chunkSize = Math.ceil(segments.length / workerCount);
  const chunks = [];
  for (let i = 0; i < segments.length; i += chunkSize) {
    chunks.push(segments.slice(i, i + chunkSize));
  }
  log.info(`Translating ${segments.length} segments with ${chunks.length} workers via ${route.provider} (${route.model})`);
  let done = 0;
  const total = segments.length;
  const chunkResults = await Promise.all(
    chunks.map(async (chunk, wi) => {
      const results = [];
      for (const seg of chunk) {
        const r = await translateOne(seg);
        results.push(r);
        done++;
        log.info(`Worker ${wi + 1}: translated ${done}/${total} — "${r.translate.slice(0, 30)}"`);
        onProgress?.(done, total);
      }
      return results;
    })
  );
  return chunkResults.flat();
}
async function interactiveTranslate(text) {
  const key = text.trim().toLowerCase();
  const cached = getCachedTranslation(key);
  if (cached) {
    log.info("Translation cache hit:", key.slice(0, 40));
    return cached;
  }
  const prompt = `Translate this English text to Thai. Reply with ONLY the Thai translation, nothing else.

Text: ${text}

Thai:`;
  const result = await aiGenerate("translate", prompt, { temperature: 0.2 });
  const translation = result.replace(/^Thai:\s*/i, "").trim();
  setCachedTranslation(key, translation);
  return translation;
}
async function analyzeSession(data) {
  const prompt = `You are an English language coach analyzing a student's shadowing practice session.

Session data:
${JSON.stringify(data, null, 2)}

Analyze the session and return ONLY valid JSON with this structure (no markdown, no thinking):
{
  "summary": {
    "overall_feedback": "...",
    "main_weaknesses": ["...", "..."]
  },
  "sentences_to_review": [
    {"sentence_id": "...", "original": "...", "translate": "...", "reason": "...", "priority": "high|medium|low"}
  ],
  "words_to_practice": [
    {"word": "...", "translate": "...", "reason": "...", "priority": "high|medium|low"}
  ],
  "grammar_items": [
    {"name": "...", "pattern": "...", "explanation_th": "...", "examples": [{"original": "...", "translate": "..."}]}
  ]
}`;
  let attempt = 0;
  while (attempt < 3) {
    try {
      const raw = await aiGenerate("analysis", prompt, { temperature: 0.2, num_ctx: 16384 });
      const jsonStr = extractJSON(raw);
      return JSON.parse(jsonStr);
    } catch (e) {
      log.warn(`Analysis attempt ${attempt + 1} failed:`, e);
      attempt++;
    }
  }
  return {
    summary: { overall_feedback: "Analysis not available", main_weaknesses: [] },
    sentences_to_review: [],
    words_to_practice: [],
    grammar_items: []
  };
}
function getTtsScriptPath() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "tts_generate.py");
  }
  return path.join(__dirname, "../../resources/tts_generate.py");
}
function textToCachePath(text, suffix = "") {
  const hash = crypto.createHash("md5").update(text.trim().toLowerCase()).digest("hex");
  return path.join(getTtsCacheDir(), `${hash}${suffix}.wav`);
}
async function generateTts(text, voice = "tara") {
  const route = resolveRoute("tts", getSetting);
  if (route.provider === "gemini") {
    const geminiCachePath = textToCachePath(text, "_gemini");
    if (fs.existsSync(geminiCachePath) && fs.statSync(geminiCachePath).size > 0) {
      log.info("TTS cache hit (gemini):", geminiCachePath);
      return geminiCachePath;
    }
    try {
      const wav = await geminiTts(route.model, text, getSetting("gemini_tts_voice") || "Kore");
      fs.writeFileSync(geminiCachePath, wav);
      log.info("TTS done (gemini):", geminiCachePath);
      return geminiCachePath;
    } catch (err) {
      log.warn("Gemini TTS failed, falling back to local voice:", err);
    }
  }
  const cachePath = textToCachePath(text);
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
    log.info("TTS cache hit:", cachePath);
    return cachePath;
  }
  const scriptPath = getTtsScriptPath();
  log.info("TTS generate:", text.slice(0, 60));
  return new Promise((resolve, reject) => {
    const proc = child_process.spawn(PYTHON3_PATH, [scriptPath, text, cachePath, voice], {
      env: CHILD_ENV
    });
    let stdout = "";
    proc.stdout.on("data", (d) => stdout += d.toString());
    proc.stderr.on("data", (d) => log.info("TTS:", d.toString().trim()));
    proc.on("close", (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout.trim());
          if (result.success && result.path) {
            log.info("TTS done:", result.path, "method:", result.method);
            resolve(result.path);
          } else {
            reject(new Error(result.error || "TTS failed"));
          }
        } catch {
          reject(new Error(`TTS parse error: ${stdout.slice(0, 200)}`));
        }
      } else {
        reject(new Error(`TTS script exited ${code}: ${stdout.slice(0, 200)}`));
      }
    });
    proc.on("error", (e) => reject(new Error(`Cannot run TTS: ${e.message}`)));
  });
}
function sendProgress(win, step, detail, pct) {
  win?.webContents.send("import:progress", { step, detail, pct });
}
function saveSegments(sessionId, whisperSegs, translations) {
  const db2 = getDb();
  const insert = db2.prepare(`
    INSERT INTO segments (id, session_id, original, translate, start_time, end_time, duration, word_timestamps, transcription_model, translation_model, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db2.transaction(() => {
    for (let i = 0; i < whisperSegs.length; i++) {
      const seg = whisperSegs[i];
      const id = `seg_${uuid.v4()}`;
      insert.run(
        id,
        sessionId,
        seg.text.trim(),
        translations.get(String(seg.id)) || "",
        seg.start,
        seg.end,
        seg.end - seg.start,
        JSON.stringify(seg.words || []),
        "whisper-large-v3-turbo",
        "qwen3.5:9b",
        i
      );
    }
  });
  tx();
}
async function runTranslation(segs, win, progressBase) {
  const total = segs.length;
  sendProgress(win, "translating", `Translating 0/${total}...`, progressBase);
  const input = segs.map((s) => ({ id: String(s.id), original: s.text.trim() }));
  const results = await bulkTranslateSegments(input, (done, tot) => {
    const pct = progressBase + Math.round(done / tot * 20);
    sendProgress(win, "translating", `Translating ${done}/${tot}...`, pct);
  });
  const map = /* @__PURE__ */ new Map();
  for (const r of results) map.set(r.id, r.translate);
  return map;
}
function mergeAudioFiles(inputPaths, outputPath, _durations) {
  return new Promise((resolve, reject) => {
    const listPath = path.join(os.tmpdir(), `concat_${Date.now()}.txt`);
    const listContent = inputPaths.map((p) => `file '${p}'`).join("\n");
    fs.writeFileSync(listPath, listContent);
    const proc = child_process.spawn(FFMPEG_PATH, [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-ar",
      "24000",
      "-ac",
      "1",
      "-y",
      outputPath
    ], { env: CHILD_ENV });
    proc.on("close", (code) => {
      fs.existsSync(listPath) && fs.unlinkSync(listPath);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg concat failed (code ${code})`));
    });
    proc.on("error", (e) => reject(e));
  });
}
function registerImportHandlers(getWindow2) {
  electron.ipcMain.handle("import:youtube", async (_e, url) => {
    const win = getWindow2();
    const db2 = getDb();
    const mediaDir = getMediaDir();
    try {
      sendProgress(win, "metadata", "Fetching YouTube metadata...", 5);
      const meta = await fetchYtMetadata(url);
      let localMediaPath;
      let whisperAudioPath;
      try {
        sendProgress(win, "download", "Downloading video (≤480p)...", 10);
        const videoPath = await downloadYtVideo(
          url,
          mediaDir,
          (msg) => sendProgress(win, "download", msg, 25)
        );
        localMediaPath = videoPath;
        sendProgress(win, "extract", "Extracting audio for transcription...", 30);
        whisperAudioPath = await extractAudio(
          videoPath,
          mediaDir,
          (msg) => sendProgress(win, "extract", msg, 35)
        );
      } catch (videoErr) {
        log.warn("[YouTube import] Video download failed, falling back to audio-only:", videoErr);
        sendProgress(win, "download", "Downloading audio (video unavailable)...", 10);
        whisperAudioPath = await downloadYtAudio(
          url,
          mediaDir,
          (msg) => sendProgress(win, "download", msg, 30)
        );
        localMediaPath = whisperAudioPath;
      }
      sendProgress(win, "transcribe", "Transcribing with Whisper...", 38);
      const whisperResult = await transcribeAudio(
        whisperAudioPath,
        (msg) => sendProgress(win, "transcribe", msg, 43)
      );
      sendProgress(win, "segment", "Segmenting transcript...", 65);
      const segments = segmentizeTranscript(whisperResult);
      const translations = await runTranslation(segments, win, 70);
      sendProgress(win, "saving", "Saving session...", 90);
      const sourceId = `src_${uuid.v4()}`;
      const sessionId = `ses_${uuid.v4()}`;
      db2.prepare(
        "INSERT INTO sources (id, type, title, url, local_media_path, thumbnail, duration_seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(sourceId, "youtube", meta.title, url, localMediaPath, meta.thumbnail || "", meta.duration || 0, (/* @__PURE__ */ new Date()).toISOString());
      db2.prepare(
        "INSERT INTO sessions (id, source_id, title, created_at, total_segments) VALUES (?, ?, ?, ?, ?)"
      ).run(sessionId, sourceId, meta.title, (/* @__PURE__ */ new Date()).toISOString(), segments.length);
      saveSegments(sessionId, segments, translations);
      sendProgress(win, "done", "Import complete!", 100);
      return { sessionId, title: meta.title, segmentCount: segments.length };
    } catch (err) {
      log.error("YouTube import error:", err);
      throw err;
    }
  });
  electron.ipcMain.handle("import:file", async (_e, filePath) => {
    const win = getWindow2();
    const db2 = getDb();
    const mediaDir = getMediaDir();
    try {
      const ext = path.extname(filePath).toLowerCase();
      const title = path.basename(filePath, ext);
      const isVideoFile = [".mp4", ".mov", ".mkv", ".avi", ".webm"].includes(ext);
      let audioPath = filePath;
      if (isVideoFile) {
        sendProgress(win, "extract", "Extracting audio...", 10);
        audioPath = await extractAudio(
          filePath,
          mediaDir,
          (msg) => sendProgress(win, "extract", msg, 15)
        );
      }
      sendProgress(win, "transcribe", "Transcribing with Whisper...", 25);
      const whisperResult = await transcribeAudio(
        audioPath,
        (msg) => sendProgress(win, "transcribe", msg, 30)
      );
      sendProgress(win, "segment", "Segmenting...", 60);
      const segments = segmentizeTranscript(whisperResult);
      const translations = await runTranslation(segments, win, 65);
      sendProgress(win, "saving", "Saving...", 90);
      const sourceId = `src_${uuid.v4()}`;
      const sessionId = `ses_${uuid.v4()}`;
      let mediaPath;
      if (isVideoFile) {
        const videoDestPath = path.join(mediaDir, path.basename(filePath));
        if (filePath !== videoDestPath && !fs.existsSync(videoDestPath)) {
          fs.copyFileSync(filePath, videoDestPath);
        }
        mediaPath = fs.existsSync(videoDestPath) ? videoDestPath : filePath;
      } else {
        const destPath = path.join(mediaDir, path.basename(audioPath));
        if (audioPath !== destPath && !fs.existsSync(destPath)) {
          fs.copyFileSync(audioPath, destPath);
        }
        mediaPath = destPath;
      }
      db2.prepare(
        "INSERT INTO sources (id, type, title, url, local_media_path, thumbnail, duration_seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(sourceId, ext.slice(1) || "audio", title, "", mediaPath, "", 0, (/* @__PURE__ */ new Date()).toISOString());
      db2.prepare(
        "INSERT INTO sessions (id, source_id, title, created_at, total_segments) VALUES (?, ?, ?, ?, ?)"
      ).run(sessionId, sourceId, title, (/* @__PURE__ */ new Date()).toISOString(), segments.length);
      saveSegments(sessionId, segments, translations);
      sendProgress(win, "done", "Import complete!", 100);
      return { sessionId, title, segmentCount: segments.length };
    } catch (err) {
      log.error("File import error:", err);
      throw err;
    }
  });
  electron.ipcMain.handle("import:transcript", async (_e, text, title) => {
    const win = getWindow2();
    const db2 = getDb();
    const mediaDir = getMediaDir();
    try {
      sendProgress(win, "parse", "Parsing transcript...", 5);
      const phrases = text.split(/;/).map((l) => l.trim()).filter((l) => l.length > 1);
      if (phrases.length === 0) throw new Error("No segments found. Use ; to separate sentences.");
      const segments = phrases.map((l, i) => ({
        id: i,
        start: 0,
        end: 0,
        text: l,
        words: []
      }));
      sendProgress(win, "tts", `Generating TTS audio (0/${phrases.length})...`, 10);
      const segmentAudioPaths = [];
      const segmentDurations = [];
      for (let i = 0; i < phrases.length; i++) {
        try {
          const audioPath = await generateTts(phrases[i]);
          segmentAudioPaths.push(audioPath);
          const dur = await getMediaDuration(audioPath);
          segmentDurations.push(dur || 3);
          sendProgress(win, "tts", `Generated TTS ${i + 1}/${phrases.length}`, 10 + Math.round(i / phrases.length * 40));
        } catch (err) {
          log.warn(`TTS failed for segment ${i}:`, err);
          segmentAudioPaths.push("");
          segmentDurations.push(3);
        }
      }
      let cursor = 0;
      for (let i = 0; i < segments.length; i++) {
        segments[i].start = cursor;
        segments[i].end = cursor + segmentDurations[i];
        cursor += segmentDurations[i] + 0.3;
      }
      sendProgress(win, "merge", "Merging audio...", 55);
      const mergedAudioPath = path.join(mediaDir, `transcript_${Date.now()}.wav`);
      const validPaths = segmentAudioPaths.filter((p) => p && fs.existsSync(p));
      if (validPaths.length > 0) {
        await mergeAudioFiles(validPaths, mergedAudioPath, segmentDurations.filter((_, i) => segmentAudioPaths[i]));
      }
      const translations = await runTranslation(segments, win, 60);
      sendProgress(win, "saving", "Saving...", 90);
      const sourceId = `src_${uuid.v4()}`;
      const sessionId = `ses_${uuid.v4()}`;
      db2.prepare(
        "INSERT INTO sources (id, type, title, url, local_media_path, thumbnail, duration_seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        sourceId,
        "transcript",
        title,
        "",
        fs.existsSync(mergedAudioPath) ? mergedAudioPath : "",
        "",
        cursor,
        (/* @__PURE__ */ new Date()).toISOString()
      );
      db2.prepare(
        "INSERT INTO sessions (id, source_id, title, created_at, total_segments) VALUES (?, ?, ?, ?, ?)"
      ).run(sessionId, sourceId, title, (/* @__PURE__ */ new Date()).toISOString(), segments.length);
      saveSegments(sessionId, segments, translations);
      sendProgress(win, "done", "Import complete!", 100);
      return { sessionId, title, segmentCount: segments.length };
    } catch (err) {
      log.error("Transcript import error:", err);
      throw err;
    }
  });
}
function scoreAttempt(original, userTranscript, targetDuration, actualDuration) {
  const origWords = tokenize(original);
  const userWords = tokenize(userTranscript);
  const { matched, missing, incorrect, extra } = compareWords(origWords, userWords);
  const accuracy = origWords.length > 0 ? Math.round(matched / origWords.length * 100) : 0;
  const speedRatio = targetDuration > 0 ? actualDuration / targetDuration : 1;
  const speed = Math.round(Math.max(0, 100 - Math.abs(speedRatio - 1) * 100));
  const pronunciation = Math.round(
    Math.max(0, accuracy - incorrect.length * 5)
  );
  const rhythm = Math.round(
    Math.max(0, 100 - Math.abs(speedRatio - 1) * 80 - missing.length * 3)
  );
  const overall = Math.round(accuracy * 0.4 + pronunciation * 0.25 + rhythm * 0.2 + speed * 0.15);
  const parts = [];
  if (missing.length > 0) parts.push(`Missing words: ${missing.join(", ")}`);
  if (incorrect.length > 0) parts.push(`Check pronunciation: ${incorrect.join(", ")}`);
  if (extra.length > 0) parts.push(`Extra words: ${extra.join(", ")}`);
  if (overall >= 90) parts.push("Excellent!");
  else if (overall >= 75) parts.push("Good job! Keep practicing.");
  else if (overall >= 60) parts.push("Keep going, you can improve!");
  else parts.push("Try again — listen carefully to the original.");
  return {
    accuracy_score: accuracy,
    pronunciation_score: pronunciation,
    rhythm_score: rhythm,
    speed_score: speed,
    overall_score: overall,
    missing_words: missing,
    incorrect_words: incorrect,
    extra_words: extra,
    feedback_text: parts.join(" ")
  };
}
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9'\s]/g, "").split(/\s+/).filter(Boolean);
}
function compareWords(orig, user) {
  const origSet = new Set(orig);
  const userSet = new Set(user);
  const matched = orig.filter((w) => userSet.has(w) || isSimilar(w, user)).length;
  const missing = orig.filter((w) => !userSet.has(w) && !isSimilar(w, user));
  const incorrect = user.filter((w) => !origSet.has(w) && orig.some((o) => editDistance(o, w) <= 2 && editDistance(o, w) > 0));
  const extra = user.filter((w) => !origSet.has(w) && !incorrect.includes(w));
  return { matched, missing, incorrect, extra };
}
function isSimilar(word, candidates) {
  return candidates.some((c) => editDistance(word, c) <= 1);
}
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from(
    { length: m + 1 },
    (_, i) => Array.from({ length: n + 1 }, (_2, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
function registerPracticeHandlers(getWindow2) {
  electron.ipcMain.handle("recording:save", async (_e, base64, filename) => {
    const recDir = getRecordingsDir();
    const filePath = path.join(recDir, filename);
    const buffer = Buffer.from(base64, "base64");
    fs.writeFileSync(filePath, buffer);
    log.info("Recording saved:", filePath, buffer.length, "bytes");
    return filePath;
  });
  electron.ipcMain.handle("practice:attempt:save", async (_e, data) => {
    const db2 = getDb();
    const id = `att_${uuid.v4()}`;
    db2.prepare(`
      INSERT INTO practice_attempts
        (id, segment_id, user_transcript, audio_path, accuracy_score, pronunciation_score,
         rhythm_score, speed_score, overall_score, feedback, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.segment_id,
      data.user_transcript,
      data.audio_path,
      data.accuracy_score,
      data.pronunciation_score,
      data.rhythm_score,
      data.speed_score,
      data.overall_score,
      data.feedback,
      (/* @__PURE__ */ new Date()).toISOString()
    );
    return { id };
  });
  electron.ipcMain.handle("practice:transcribe-recording", async (_e, audioPath, original, targetDuration, actualDuration) => {
    try {
      log.info("Transcribing recording:", audioPath);
      const result = await transcribeAudio(audioPath);
      const userTranscript = result.text.trim();
      const scores = scoreAttempt(original, userTranscript, targetDuration, actualDuration);
      log.info("Transcription result:", userTranscript, "Score:", scores.overall_score);
      return { userTranscript, scores };
    } catch (err) {
      log.error("Recording transcription error:", err);
      throw err;
    }
  });
  electron.ipcMain.handle("practice:get-attempts", (_e, segmentId) => {
    return getDb().prepare("SELECT * FROM practice_attempts WHERE segment_id = ? ORDER BY created_at DESC").all(segmentId);
  });
  electron.ipcMain.handle("practice:session-analyze", async (_e, sessionId) => {
    const win = getWindow2();
    const db2 = getDb();
    win?.webContents.send("analysis:progress", { status: "starting", msg: "Analyzing session..." });
    const segments = db2.prepare("SELECT id, original, translate FROM segments WHERE session_id = ? ORDER BY position").all(sessionId);
    const attempts = db2.prepare(`
        SELECT pa.segment_id, pa.user_transcript, pa.overall_score, pa.accuracy_score
        FROM practice_attempts pa
        JOIN segments s ON pa.segment_id = s.id
        WHERE s.session_id = ?
        ORDER BY pa.created_at DESC
      `).all(sessionId);
    const topAttempts = /* @__PURE__ */ new Map();
    for (const a of attempts) {
      if (!topAttempts.has(a.segment_id)) topAttempts.set(a.segment_id, a);
    }
    win?.webContents.send("analysis:progress", { status: "running", msg: "Running AI analysis (may take a minute)..." });
    const analysis = await analyzeSession({
      segments: segments.slice(0, 30),
      attempts: Array.from(topAttempts.values())
    });
    const analysisId = `ana_${uuid.v4()}`;
    db2.prepare("INSERT INTO session_analysis (id, session_id, summary, created_at) VALUES (?, ?, ?, ?)").run(
      analysisId,
      sessionId,
      JSON.stringify(analysis),
      (/* @__PURE__ */ new Date()).toISOString()
    );
    const threshold = parseInt(getSetting("low_score_threshold") || "70", 10);
    const parsed = analysis;
    if (parsed.words_to_practice?.length) {
      const insertVocab = db2.prepare(
        "INSERT OR IGNORE INTO vocabulary_items (id, word, translate, source_session_id, reason, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      const tx = db2.transaction(() => {
        for (const w of parsed.words_to_practice) {
          insertVocab.run(`voc_${uuid.v4()}`, w.word, w.translate, sessionId, w.reason, w.priority, (/* @__PURE__ */ new Date()).toISOString());
        }
      });
      tx();
    }
    if (parsed.grammar_items?.length) {
      for (const g of parsed.grammar_items) {
        const existing = db2.prepare("SELECT id, source_sessions FROM grammar_items WHERE name = ?").get(g.name);
        if (existing) {
          const sessions = JSON.parse(existing.source_sessions || "[]");
          if (!sessions.includes(sessionId)) sessions.push(sessionId);
          db2.prepare("UPDATE grammar_items SET last_seen_at = ?, source_sessions = ? WHERE id = ?").run(
            (/* @__PURE__ */ new Date()).toISOString(),
            JSON.stringify(sessions),
            existing.id
          );
        } else {
          db2.prepare(
            "INSERT INTO grammar_items (id, name, pattern, explanation_th, examples, last_seen_at, source_sessions) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).run(
            `grm_${uuid.v4()}`,
            g.name,
            g.pattern,
            g.explanation_th,
            JSON.stringify(g.examples || []),
            (/* @__PURE__ */ new Date()).toISOString(),
            JSON.stringify([sessionId])
          );
        }
      }
    }
    const lowSegs = segments.filter((s) => {
      const att = topAttempts.get(s.id);
      return att && att.overall_score < threshold;
    });
    if (lowSegs.length > 0) {
      const insertCard = db2.prepare(
        "INSERT OR IGNORE INTO flashcards (id, type, front, back, source_segment_id, session_id, next_due_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      const tomorrow = new Date(Date.now() + 864e5).toISOString();
      const tx = db2.transaction(() => {
        for (const s of lowSegs) {
          insertCard.run(`card_${uuid.v4()}`, "sentence_speaking", s.original, s.translate || s.original, s.id, sessionId, tomorrow);
        }
      });
      tx();
    }
    win?.webContents.send("analysis:progress", { status: "done", msg: "Analysis complete!" });
    return { analysisId, analysis, flashcardsCreated: lowSegs.length };
  });
}
function registerTranslateHandlers() {
  electron.ipcMain.handle("translate:interactive", async (_e, text) => {
    return interactiveTranslate(text);
  });
  electron.ipcMain.handle("translate:segment:update", (_e, segmentId, translate) => {
    getDb().prepare("UPDATE segments SET translate = ? WHERE id = ?").run(translate, segmentId);
    return true;
  });
}
function registerFlashcardHandlers() {
  electron.ipcMain.handle("flashcard:list", (_e, type) => {
    const db2 = getDb();
    if (type) {
      return db2.prepare("SELECT * FROM flashcards WHERE type = ? ORDER BY next_due_at ASC").all(type);
    }
    return db2.prepare("SELECT * FROM flashcards ORDER BY next_due_at ASC").all();
  });
  electron.ipcMain.handle("flashcard:due", () => {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const maxDue = Math.max(1, parseInt(getSetting("max_due_cards") || "30", 10) || 30);
    return getDb().prepare("SELECT * FROM flashcards WHERE next_due_at <= ? OR next_due_at IS NULL ORDER BY next_due_at ASC LIMIT ?").all(now, maxDue);
  });
  electron.ipcMain.handle("flashcard:review", (_e, cardId, rating) => {
    const db2 = getDb();
    const card = db2.prepare("SELECT * FROM flashcards WHERE id = ?").get(cardId);
    if (!card) return false;
    let { ease_factor, interval_days } = card;
    const isCorrect = rating === "very_easy" || rating === "easy";
    const easeAdjust = {
      very_easy: 0.1,
      easy: 0,
      hard: -0.15,
      very_hard: -0.3
    };
    ease_factor = Math.max(1.3, ease_factor + easeAdjust[rating]);
    const intervalMultiplier = {
      very_easy: 4,
      easy: 2.5,
      hard: 1,
      very_hard: 0.25
    };
    if (rating === "very_hard") {
      interval_days = 0.25;
    } else {
      interval_days = Math.max(1, interval_days * intervalMultiplier[rating]);
    }
    const nextDue = new Date(Date.now() + interval_days * 864e5).toISOString();
    db2.prepare(`
      UPDATE flashcards SET
        ease_factor = ?, interval_days = ?, next_due_at = ?,
        last_reviewed_at = ?, review_count = review_count + 1,
        correct_count = correct_count + ?
      WHERE id = ?
    `).run(ease_factor, interval_days, nextDue, (/* @__PURE__ */ new Date()).toISOString(), isCorrect ? 1 : 0, cardId);
    db2.prepare("INSERT INTO review_history (id, flashcard_id, rating, reviewed_at) VALUES (?, ?, ?, ?)").run(
      `rev_${uuid.v4()}`,
      cardId,
      rating,
      (/* @__PURE__ */ new Date()).toISOString()
    );
    return true;
  });
  electron.ipcMain.handle("flashcard:create", (_e, data) => {
    const db2 = getDb();
    const id = `card_${uuid.v4()}`;
    const tomorrow = new Date(Date.now() + 864e5).toISOString();
    db2.prepare(
      "INSERT INTO flashcards (id, type, front, back, source_segment_id, session_id, next_due_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, data.type, data.front, data.back, data.source_segment_id || null, data.session_id || null, tomorrow);
    return { id };
  });
  electron.ipcMain.handle("flashcard:exists", (_e, front) => {
    const row = getDb().prepare("SELECT id FROM flashcards WHERE front = ? LIMIT 1").get(front);
    return !!row;
  });
  electron.ipcMain.handle("flashcard:delete", (_e, cardId) => {
    getDb().prepare("DELETE FROM flashcards WHERE id = ?").run(cardId);
    return true;
  });
  electron.ipcMain.handle("flashcard:delete-many", (_e, cardIds) => {
    if (!Array.isArray(cardIds) || cardIds.length === 0) return 0;
    const db2 = getDb();
    const del = db2.prepare("DELETE FROM flashcards WHERE id = ?");
    const tx = db2.transaction((ids) => {
      let count = 0;
      for (const id of ids) count += del.run(id).changes;
      return count;
    });
    return tx(cardIds);
  });
  electron.ipcMain.handle("flashcard:update", (_e, cardId, data) => {
    const db2 = getDb();
    const card = db2.prepare("SELECT id FROM flashcards WHERE id = ?").get(cardId);
    if (!card) return false;
    db2.prepare("UPDATE flashcards SET type = COALESCE(?, type), front = COALESCE(?, front), back = COALESCE(?, back) WHERE id = ?").run(data.type ?? null, data.front ?? null, data.back ?? null, cardId);
    return true;
  });
  electron.ipcMain.handle("flashcard:stats", () => {
    const db2 = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const maxDue = Math.max(1, parseInt(getSetting("max_due_cards") || "30", 10) || 30);
    const total = db2.prepare("SELECT COUNT(*) as c FROM flashcards").get().c;
    const due = db2.prepare("SELECT COUNT(*) as c FROM flashcards WHERE next_due_at <= ? OR next_due_at IS NULL").get(now).c;
    const byType = db2.prepare("SELECT type, COUNT(*) as c FROM flashcards GROUP BY type").all();
    return { total, due: Math.min(due, maxDue), totalDue: due, byType };
  });
}
function registerDashboardHandlers() {
  electron.ipcMain.handle("dashboard:stats", () => {
    const db2 = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const totalSessions = db2.prepare("SELECT COUNT(*) as c FROM sessions").get().c;
    const totalSegments = db2.prepare("SELECT COUNT(*) as c FROM segments").get().c;
    const totalAttempts = db2.prepare("SELECT COUNT(*) as c FROM practice_attempts").get().c;
    const avgScore = db2.prepare("SELECT AVG(overall_score) as a FROM practice_attempts").get().a;
    const totalVocab = db2.prepare("SELECT COUNT(*) as c FROM vocabulary_items").get().c;
    const totalGrammar = db2.prepare("SELECT COUNT(*) as c FROM grammar_items").get().c;
    const dueFlashcards = db2.prepare("SELECT COUNT(*) as c FROM flashcards WHERE next_due_at <= ? OR next_due_at IS NULL").get(now).c;
    const totalFlashcards = db2.prepare("SELECT COUNT(*) as c FROM flashcards").get().c;
    const recentSessions = db2.prepare(`
        SELECT s.id, s.title, s.created_at, s.completion_percentage, s.total_segments,
               AVG(pa.overall_score) as avg_score
        FROM sessions s
        LEFT JOIN segments seg ON s.id = seg.session_id
        LEFT JOIN practice_attempts pa ON seg.id = pa.segment_id
        GROUP BY s.id
        ORDER BY s.created_at DESC
        LIMIT 5
      `).all();
    const scoreByDay = db2.prepare(`
        SELECT date(pa.created_at) as day, AVG(pa.overall_score) as avg_score, COUNT(*) as count
        FROM practice_attempts pa
        WHERE pa.created_at >= datetime('now', '-14 days')
        GROUP BY date(pa.created_at)
        ORDER BY day ASC
      `).all();
    const topMissedWords = db2.prepare(`
        SELECT word, COUNT(*) as c FROM vocabulary_items
        WHERE priority = 'high'
        GROUP BY word ORDER BY c DESC LIMIT 10
      `).all();
    const speaking = db2.prepare("SELECT COUNT(*) as c, AVG(score) as a FROM speaking_answers").get();
    const speakingQuestions = db2.prepare("SELECT COUNT(*) as c FROM speaking_questions").get().c;
    const activityByDay = db2.prepare(`
        SELECT day, SUM(c) as count FROM (
          SELECT date(created_at) as day, COUNT(*) as c FROM practice_attempts GROUP BY day
          UNION ALL SELECT date(reviewed_at) as day, COUNT(*) as c FROM review_history GROUP BY day
          UNION ALL SELECT date(created_at) as day, COUNT(*) as c FROM speaking_answers GROUP BY day
          UNION ALL SELECT date(completed_at) as day, COUNT(*) as c FROM quiz_attempts GROUP BY day
        )
        WHERE day IS NOT NULL
        GROUP BY day ORDER BY day ASC
      `).all();
    const dayMs = 864e5;
    const days = activityByDay.map((r) => r.day);
    const daySet = new Set(days);
    const todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    let currentStreak = 0;
    let cursor = daySet.has(todayStr) ? Date.parse(todayStr) : Date.parse(todayStr) - dayMs;
    while (daySet.has(new Date(cursor).toISOString().slice(0, 10))) {
      currentStreak += 1;
      cursor -= dayMs;
    }
    let bestStreak = 0;
    let runLength = 0;
    let prevTime = 0;
    for (const day of days) {
      const t = Date.parse(day);
      runLength = prevTime && t - prevTime === dayMs ? runLength + 1 : 1;
      bestStreak = Math.max(bestStreak, runLength);
      prevTime = t;
    }
    return {
      totalSpeakingAnswers: speaking.c,
      totalSpeakingQuestions: speakingQuestions,
      avgSpeakingScore: Math.round((speaking.a ?? 0) * 10) / 10,
      activityByDay,
      currentStreak,
      bestStreak,
      totalSessions,
      totalSegments,
      totalAttempts,
      avgScore: Math.round((avgScore ?? 0) * 10) / 10,
      totalVocab,
      totalGrammar,
      dueFlashcards,
      totalFlashcards,
      recentSessions,
      scoreByDay,
      topMissedWords
    };
  });
  electron.ipcMain.handle("grammar:list", () => {
    return getDb().prepare("SELECT * FROM grammar_items ORDER BY last_seen_at DESC").all();
  });
  electron.ipcMain.handle("vocabulary:list", () => {
    return getDb().prepare("SELECT * FROM vocabulary_items ORDER BY created_at DESC").all();
  });
}
function registerSettingsHandlers() {
  electron.ipcMain.handle("settings:get", () => {
    const keys = [
      "ollama_base_url",
      "whisper_model",
      "bulk_translate_model",
      "interactive_translate_model",
      "analysis_model",
      "embedding_model",
      "tts_model",
      "low_score_threshold",
      "translate_workers",
      "max_due_cards",
      "gemini_api_key",
      "analysis_provider",
      "translate_provider",
      "tts_provider",
      "gemini_analysis_model",
      "gemini_translate_model",
      "gemini_tts_model",
      "gemini_tts_voice"
    ];
    const result = {};
    for (const k of keys) {
      result[k] = getSetting(k) || "";
    }
    return result;
  });
  electron.ipcMain.handle("settings:set", (_e, key, value) => {
    setSetting(key, value);
    return true;
  });
  electron.ipcMain.handle("settings:set-all", (_e, data) => {
    for (const [k, v] of Object.entries(data)) {
      setSetting(k, v);
    }
    return true;
  });
  electron.ipcMain.handle("models:list", async () => {
    return listModels();
  });
  electron.ipcMain.handle("dialog:open-file", async () => {
    const result = await electron.dialog.showOpenDialog({
      filters: [
        { name: "Media", extensions: ["mp4", "mov", "mkv", "avi", "webm", "mp3", "wav", "m4a", "flac"] }
      ],
      properties: ["openFile"]
    });
    return result.filePaths[0] || null;
  });
  electron.ipcMain.handle("models:status", async () => {
    const models = await listModels();
    const required = {
      "bulk_translate_model": getSetting("bulk_translate_model") || "scb10x/typhoon-translate1.5-4b",
      "interactive_translate_model": getSetting("interactive_translate_model") || "scb10x/typhoon-translate1.5-4b",
      "analysis_model": getSetting("analysis_model") || "qwen3.5:9b",
      "embedding_model": getSetting("embedding_model") || "bge-m3",
      "tts_model": getSetting("tts_model") || "legraphista/Orpheus:latest"
    };
    return Object.entries(required).map(([role, model]) => ({
      role,
      model,
      available: models.some((m) => m.startsWith(model) || m === model),
      readonly: role === "tts_model"
    }));
  });
}
function registerTtsHandlers() {
  electron.ipcMain.handle("tts:speak", async (_e, text, voice) => {
    try {
      const audioPath = await generateTts(text, voice || "tara");
      return { path: audioPath };
    } catch (err) {
      log.error("TTS error:", err);
      throw err;
    }
  });
}
function extractJSONObject(text) {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start < 0) throw new Error("Quiz response did not contain JSON");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return cleaned.slice(start, index + 1);
    }
  }
  throw new Error("Quiz JSON was incomplete");
}
function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}
function parseGeneratedExam(raw) {
  const parsed = JSON.parse(extractJSONObject(raw));
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const questions = rawQuestions.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry;
    const question = cleanText(item.question);
    const options = Array.isArray(item.options) ? item.options.map(cleanText) : [];
    const correctIndex = Number(item.correctIndex);
    if (!question || options.length !== 4 || options.some((option) => !option) || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return [];
    return [{
      id: cleanText(item.id) || `q${index + 1}`,
      question,
      options,
      correctIndex,
      explanation: cleanText(item.explanation) || "Review the source transcript for this answer.",
      tag: cleanText(item.tag) || "Comprehension"
    }];
  }).slice(0, 10);
  if (questions.length < 5) {
    throw new Error(`Quiz must contain at least 5 valid questions; received ${questions.length}`);
  }
  const suppliedTags = Array.isArray(parsed.tags) ? parsed.tags.map(cleanText).filter(Boolean) : [];
  const tags = Array.from(/* @__PURE__ */ new Set([...suppliedTags, ...questions.map((question) => question.tag)])).slice(0, 6);
  return {
    title: cleanText(parsed.title) || "Post-Session Comprehension Quiz",
    tags,
    questions
  };
}
function gradeExam(questions, answers) {
  const correctCount = questions.reduce(
    (count, question, index) => count + (answers[index] === question.correctIndex ? 1 : 0),
    0
  );
  const totalQuestions = questions.length;
  const score = totalQuestions > 0 ? Math.round(correctCount / totalQuestions * 100) : 0;
  return { correctCount, totalQuestions, score };
}
async function generateExamQuiz(data) {
  const { model } = routeFor("analysis");
  const questionCount = Math.max(5, Math.min(10, data.questionCount ?? 7));
  const transcript = data.segments.map((segment) => `${segment.position + 1}. ${segment.original}${segment.translate ? `
Thai: ${segment.translate}` : ""}`).join("\n").slice(0, 24e3);
  const prompt = `You create short comprehension exams for an English shadowing application.

Session title: ${data.sessionTitle}
Transcript:
${transcript}

Create exactly ${questionCount} multiple-choice questions about the meaning, facts, sequence, main idea, and speaker intent in the clip.
- Questions and options must be in English.
- Every question must have exactly 4 plausible options.
- correctIndex is zero-based (0-3).
- explanation should be a concise Thai explanation of why the answer is correct.
- tag is a short category such as Main Idea, Detail, Sequence, Vocabulary, or Speaker Intent.
- Do not ask about information outside the transcript.

Return ONLY strict JSON with this shape, without markdown or commentary:
{
  "title": "...",
  "tags": ["Comprehension", "..."],
  "questions": [
    {
      "id": "q1",
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "explanation": "...",
      "tag": "Main Idea"
    }
  ]
}`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await aiGenerate("analysis", prompt, { temperature: 0.2, num_ctx: 16384 });
      return { exam: parseGeneratedExam(raw), model };
    } catch (error) {
      lastError = error;
      log.warn(`Exam generation attempt ${attempt} failed:`, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to generate exam");
}
function parseQuestions(row) {
  return JSON.parse(row.questions);
}
function publicQuiz(row) {
  return {
    id: row.id,
    session_id: row.session_id,
    title: row.title,
    tags: JSON.parse(row.tags || "[]"),
    model: row.model,
    created_at: row.created_at,
    questions: parseQuestions(row).map(({ correctIndex: _correctIndex, explanation: _explanation, ...question }) => question)
  };
}
function attemptSummary(row) {
  return {
    id: row.id,
    quiz_id: row.quiz_id,
    session_id: row.session_id,
    correct_count: row.correct_count,
    total_questions: row.total_questions,
    score: row.score,
    completed_at: row.completed_at
  };
}
function reviewAttempt(attempt, quiz) {
  const answers = JSON.parse(attempt.answers);
  const questions = parseQuestions(quiz);
  return {
    attempt: attemptSummary(attempt),
    quiz: {
      id: quiz.id,
      session_id: quiz.session_id,
      title: quiz.title,
      tags: JSON.parse(quiz.tags || "[]"),
      model: quiz.model,
      created_at: quiz.created_at,
      questions: questions.map((question, index) => ({
        ...question,
        selectedIndex: answers[index] ?? null,
        isCorrect: answers[index] === question.correctIndex
      }))
    }
  };
}
function registerExamHandlers(getWindow2) {
  electron.ipcMain.handle("exam:session:get", (_event, sessionId) => {
    const db2 = getDb();
    const quiz = db2.prepare("SELECT * FROM session_quizzes WHERE session_id = ? ORDER BY created_at DESC LIMIT 1").get(sessionId);
    const attempts = db2.prepare("SELECT * FROM quiz_attempts WHERE session_id = ? ORDER BY completed_at DESC").all(sessionId);
    return { quiz: quiz ? publicQuiz(quiz) : null, attempts: attempts.map(attemptSummary) };
  });
  electron.ipcMain.handle("exam:generate", async (_event, sessionId, questionCount = 7) => {
    const db2 = getDb();
    const win = getWindow2();
    const session = db2.prepare("SELECT id, title, completion_percentage FROM sessions WHERE id = ?").get(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.completion_percentage < 100) throw new Error("Complete the session before taking the exam");
    win?.webContents.send("exam:progress", { status: "reading", msg: "Reading the completed transcript..." });
    const segments = db2.prepare("SELECT position, original, translate FROM segments WHERE session_id = ? ORDER BY position").all(sessionId);
    if (segments.length === 0) throw new Error("This session has no transcript to quiz");
    win?.webContents.send("exam:progress", { status: "generating", msg: "AI is creating comprehension questions..." });
    const { exam, model } = await generateExamQuiz({
      sessionTitle: session.title,
      segments,
      questionCount
    });
    win?.webContents.send("exam:progress", { status: "saving", msg: "Saving the exam for future retakes..." });
    const id = `quiz_${uuid.v4()}`;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    db2.prepare(`
      INSERT INTO session_quizzes (id, session_id, title, questions, tags, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, exam.title, JSON.stringify(exam.questions), JSON.stringify(exam.tags), model, createdAt);
    const row = db2.prepare("SELECT * FROM session_quizzes WHERE id = ?").get(id);
    win?.webContents.send("exam:progress", { status: "done", msg: "Exam ready!" });
    return publicQuiz(row);
  });
  electron.ipcMain.handle("exam:submit", (_event, quizId, rawAnswers) => {
    const db2 = getDb();
    const quiz = db2.prepare("SELECT * FROM session_quizzes WHERE id = ?").get(quizId);
    if (!quiz) throw new Error("Exam not found");
    const questions = parseQuestions(quiz);
    const answers = questions.map((_question, index) => {
      const answer = rawAnswers[index];
      return Number.isInteger(answer) && answer >= 0 && answer <= 3 ? answer : null;
    });
    const grade = gradeExam(questions, answers);
    const attemptId = `qatt_${uuid.v4()}`;
    const completedAt = (/* @__PURE__ */ new Date()).toISOString();
    db2.prepare(`
      INSERT INTO quiz_attempts
        (id, quiz_id, session_id, answers, correct_count, total_questions, score, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attemptId,
      quiz.id,
      quiz.session_id,
      JSON.stringify(answers),
      grade.correctCount,
      grade.totalQuestions,
      grade.score,
      completedAt
    );
    const attempt = db2.prepare("SELECT * FROM quiz_attempts WHERE id = ?").get(attemptId);
    return reviewAttempt(attempt, quiz);
  });
  electron.ipcMain.handle("exam:attempt:get", (_event, attemptId) => {
    const db2 = getDb();
    const attempt = db2.prepare("SELECT * FROM quiz_attempts WHERE id = ?").get(attemptId);
    if (!attempt) return null;
    const quiz = db2.prepare("SELECT * FROM session_quizzes WHERE id = ?").get(attempt.quiz_id);
    return quiz ? reviewAttempt(attempt, quiz) : null;
  });
  electron.ipcMain.handle("exam:history", () => {
    const rows = getDb().prepare(`
      SELECT qa.id, qa.quiz_id, qa.session_id, qa.correct_count, qa.total_questions,
             qa.score, qa.completed_at, s.title as session_title,
             sq.title as quiz_title, sq.tags
      FROM quiz_attempts qa
      JOIN sessions s ON s.id = qa.session_id
      JOIN session_quizzes sq ON sq.id = qa.quiz_id
      ORDER BY qa.completed_at DESC
    `).all();
    return rows.map((row) => ({ ...row, tags: JSON.parse(row.tags || "[]") }));
  });
}
function clampScore(value) {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
async function generateSpeakingQuestions(data) {
  const { model } = routeFor("analysis");
  const count = Math.max(3, Math.min(15, data.questionCount));
  const transcript = data.segments.map((segment) => `${segment.position + 1}. ${segment.original}`).join("\n").slice(0, 2e4);
  const prompt = `You create speaking-practice questions for a Thai learner of English who just studied this clip.

Session title: ${data.sessionTitle}
Transcript:
${transcript}

Create exactly ${count} short open-ended questions IN ENGLISH that the learner should answer by speaking 1-3 sentences.
- Mix question types: about the content of the clip, the learner's opinion of it, and how the topic relates to the learner's own life.
- Questions must be answerable without seeing the transcript again.
- Keep each question under 20 words, conversational tone.
- question_th is a natural Thai translation of the question.

Return ONLY strict JSON, no markdown, no commentary:
[
  {"question_en": "...", "question_th": "..."}
]`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await aiGenerate("analysis", prompt, { temperature: 0.4, num_ctx: 16384 });
      const parsed = JSON.parse(extractJSON(raw));
      const questions = parsed.filter((q) => q && typeof q.question_en === "string" && q.question_en.trim().length > 0).slice(0, count).map((q) => ({
        question_en: q.question_en.trim(),
        question_th: typeof q.question_th === "string" ? q.question_th.trim() : ""
      }));
      if (questions.length === 0) throw new Error("Model returned no questions");
      return { questions, model };
    } catch (error) {
      lastError = error;
      log.warn(`Speaking question generation attempt ${attempt} failed:`, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to generate speaking questions");
}
async function evaluateSpeakingAnswer(data) {
  const { model } = routeFor("analysis");
  const prompt = `You are an English speaking coach for a Thai learner. The learner heard a question and answered by voice; the answer below is a speech-to-text transcript (punctuation may be missing — do not penalize punctuation or capitalization).

Question: ${data.question}
Learner's spoken answer: ${data.transcript}

Evaluate the answer:
- Is the sentence grammatically correct and in natural English word order?
- Does it actually answer the question?
- score: 0-100 overall (grammar 50%, relevance 30%, naturalness 20%).
- feedback_th: 1-3 sentences in Thai explaining what was wrong or good (grammar, word order, word choice).
- corrected_sentence: the learner's own answer with grammar fixed (English). If already correct, repeat it.
- suggested_answer: one natural example answer a fluent speaker might say (English, 1-2 sentences).

Return ONLY strict JSON, no markdown:
{
  "score": 0,
  "grammar_ok": true,
  "feedback_th": "...",
  "corrected_sentence": "...",
  "suggested_answer": "..."
}`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await aiGenerate("analysis", prompt, { temperature: 0.2, num_ctx: 8192 });
      const parsed = JSON.parse(extractJSON(raw));
      return {
        evaluation: {
          score: clampScore(parsed.score),
          grammar_ok: Boolean(parsed.grammar_ok),
          feedback_th: typeof parsed.feedback_th === "string" ? parsed.feedback_th : "",
          corrected_sentence: typeof parsed.corrected_sentence === "string" ? parsed.corrected_sentence : "",
          suggested_answer: typeof parsed.suggested_answer === "string" ? parsed.suggested_answer : ""
        },
        model
      };
    } catch (error) {
      lastError = error;
      log.warn(`Speaking answer evaluation attempt ${attempt} failed:`, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to evaluate the answer");
}
function registerSpeakingHandlers(getWindow2) {
  electron.ipcMain.handle("speaking:sessions", () => {
    return getDb().prepare(`
      SELECT s.id, s.title, s.created_at, s.total_segments,
             (SELECT COUNT(*) FROM speaking_questions q WHERE q.session_id = s.id) as question_count
      FROM sessions s
      WHERE s.completion_percentage >= 100
      ORDER BY s.created_at DESC
    `).all();
  });
  electron.ipcMain.handle("speaking:generate", async (_event, sessionId, questionCount = 5) => {
    const db2 = getDb();
    const win = getWindow2();
    const session = db2.prepare("SELECT id, title, completion_percentage FROM sessions WHERE id = ?").get(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.completion_percentage < 100) throw new Error("Complete the session before speaking practice");
    win?.webContents.send("speaking:progress", { status: "reading", msg: "Reading the transcript..." });
    const segments = db2.prepare("SELECT position, original FROM segments WHERE session_id = ? ORDER BY position").all(sessionId);
    if (segments.length === 0) throw new Error("This session has no transcript");
    win?.webContents.send("speaking:progress", { status: "generating", msg: "AI is writing speaking questions..." });
    const { questions, model } = await generateSpeakingQuestions({
      sessionTitle: session.title,
      segments,
      questionCount
    });
    const batchId = `sqb_${uuid.v4()}`;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const insert = db2.prepare(`
      INSERT INTO speaking_questions (id, session_id, question_en, question_th, position, batch_id, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const rows = [];
    const tx = db2.transaction(() => {
      questions.forEach((q, index) => {
        const id = `spq_${uuid.v4()}`;
        insert.run(id, sessionId, q.question_en, q.question_th, index, batchId, model, createdAt);
        rows.push({
          id,
          session_id: sessionId,
          question_en: q.question_en,
          question_th: q.question_th,
          position: index,
          batch_id: batchId,
          model,
          created_at: createdAt
        });
      });
    });
    tx();
    win?.webContents.send("speaking:progress", { status: "done", msg: "Questions ready!" });
    return { batchId, questions: rows };
  });
  electron.ipcMain.handle("speaking:transcribe", async (_event, audioPath) => {
    log.info("Speaking: transcribing answer", audioPath);
    const result = await transcribeAudio(audioPath);
    return { transcript: result.text.trim() };
  });
  electron.ipcMain.handle("speaking:evaluate", async (_event, questionId, transcript, audioPath) => {
    const db2 = getDb();
    const question = db2.prepare("SELECT * FROM speaking_questions WHERE id = ?").get(questionId);
    if (!question) throw new Error("Question not found");
    if (!transcript.trim()) throw new Error("Empty answer transcript");
    const win = getWindow2();
    win?.webContents.send("speaking:progress", { status: "evaluating", msg: "AI is checking your grammar..." });
    const { evaluation } = await evaluateSpeakingAnswer({
      question: question.question_en,
      transcript: transcript.trim()
    });
    const id = `spa_${uuid.v4()}`;
    db2.prepare(`
      INSERT INTO speaking_answers
        (id, question_id, transcript, audio_path, score, grammar_ok, feedback_th, suggested_answer, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      questionId,
      transcript.trim(),
      audioPath || null,
      evaluation.score,
      evaluation.grammar_ok ? 1 : 0,
      evaluation.feedback_th,
      JSON.stringify({ corrected: evaluation.corrected_sentence, suggested: evaluation.suggested_answer }),
      (/* @__PURE__ */ new Date()).toISOString()
    );
    win?.webContents.send("speaking:progress", { status: "done", msg: "Feedback ready!" });
    return { answerId: id, ...evaluation };
  });
  electron.ipcMain.handle("speaking:answers", (_event, questionId) => {
    return getDb().prepare("SELECT * FROM speaking_answers WHERE question_id = ? ORDER BY created_at DESC").all(questionId);
  });
  electron.ipcMain.handle("speaking:history", () => {
    return getDb().prepare(`
      SELECT q.id, q.session_id, q.question_en, q.question_th, q.batch_id, q.created_at,
             s.title as session_title,
             COUNT(a.id) as answer_count,
             MAX(a.score) as best_score,
             (SELECT a2.transcript FROM speaking_answers a2 WHERE a2.question_id = q.id ORDER BY a2.created_at DESC LIMIT 1) as last_transcript
      FROM speaking_questions q
      JOIN sessions s ON s.id = q.session_id
      LEFT JOIN speaking_answers a ON a.question_id = q.id
      GROUP BY q.id
      ORDER BY q.created_at DESC, q.position ASC
    `).all();
  });
}
function registerGrammarHandlers() {
  electron.ipcMain.handle("grammar:chat", async (_e, grammarId, messages) => {
    const db2 = getDb();
    const grammar = db2.prepare("SELECT id, name, pattern, explanation_th, examples FROM grammar_items WHERE id = ?").get(grammarId);
    if (!grammar) throw new Error("Grammar topic not found");
    if (messages.filter((m) => m.role === "user").length <= 1) {
      db2.prepare("UPDATE grammar_items SET review_count = review_count + 1, last_seen_at = ? WHERE id = ?").run((/* @__PURE__ */ new Date()).toISOString(), grammarId);
    }
    let examples = "";
    try {
      const parsed = JSON.parse(grammar.examples || "[]");
      examples = parsed.map((ex) => `- ${ex.original}${ex.translate ? ` (${ex.translate})` : ""}`).join("\n");
    } catch {
      examples = "";
    }
    const system = `You are a friendly English tutor coaching a Thai learner to actively USE this grammar topic in speech:

Topic: ${grammar.name}
${grammar.pattern ? `Pattern: ${grammar.pattern}` : ""}
${grammar.explanation_th ? `Thai explanation: ${grammar.explanation_th}` : ""}
${examples ? `Examples:
${examples}` : ""}

Coaching rules:
- Explain briefly in Thai, but all example sentences and challenges are in English.
- Each turn: give ONE short situation or question that forces the learner to answer in English using this grammar.
- When the learner answers, first say whether the grammar was used correctly. If wrong, show the corrected sentence and explain the fix in 1-2 Thai sentences. Then give the next challenge.
- Keep every reply under 130 words. Never answer the challenge for the learner. Do not use markdown tables.`;
    const reply = await aiChat(
      "analysis",
      [{ role: "system", content: system }, ...messages],
      { temperature: 0.5, num_ctx: 8192 }
    );
    return { reply: reply.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() };
  });
}
const EXPORT_DB_NAME = "daily-speaking-export.db";
const MANIFEST_NAME = "daily-speaking-manifest.json";
function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = child_process.spawn(cmd, args, { cwd });
    let stderr = "";
    proc.stderr.on("data", (d) => stderr += d.toString());
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(0, 300)}`));
    });
    proc.on("error", (e) => reject(new Error(`Cannot run ${cmd}: ${e.message}`)));
  });
}
async function exportAllData(destZip, onProgress) {
  const userData = electron.app.getPath("userData");
  const db2 = getDb();
  onProgress?.("Snapshotting the database...");
  const exportDbPath = path.join(userData, EXPORT_DB_NAME);
  if (fs.existsSync(exportDbPath)) fs.unlinkSync(exportDbPath);
  await db2.backup(exportDbPath);
  const manifestPath = path.join(userData, MANIFEST_NAME);
  fs.writeFileSync(manifestPath, JSON.stringify({
    app: "daily-speaking",
    version: electron.app.getVersion(),
    exported_at: (/* @__PURE__ */ new Date()).toISOString(),
    platform: process.platform
  }, null, 2));
  getMediaDir();
  getRecordingsDir();
  getTtsCacheDir();
  onProgress?.("Compressing database, media, recordings and voice cache...");
  if (fs.existsSync(destZip)) fs.unlinkSync(destZip);
  const entries = [EXPORT_DB_NAME, MANIFEST_NAME, "media", "recordings", "tts_cache"].filter((entry) => fs.existsSync(path.join(userData, entry)));
  await run("zip", ["-r", "-q", destZip, ...entries], userData);
  fs.unlinkSync(exportDbPath);
  fs.unlinkSync(manifestPath);
  const sizeBytes = fs.statSync(destZip).size;
  log.info("Export complete:", destZip, sizeBytes, "bytes");
  return { path: destZip, sizeBytes };
}
function copyDirInto(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return 0;
  fs.mkdirSync(destDir, { recursive: true });
  let count = 0;
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isDirectory()) {
      count += copyDirInto(src, dest);
    } else {
      fs.copyFileSync(src, dest);
      count += 1;
    }
  }
  return count;
}
function rewritePathColumn(table, column, newDir) {
  const db2 = getDb();
  const rows = db2.prepare(`SELECT rowid, ${column} as p FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`).all();
  const update = db2.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);
  let changed = 0;
  const tx = db2.transaction(() => {
    for (const row of rows) {
      const rewritten = path.join(newDir, path.basename(row.p));
      if (rewritten !== row.p) {
        update.run(rewritten, row.rowid);
        changed += 1;
      }
    }
  });
  tx();
  return changed;
}
async function importAllData(srcZip, onProgress) {
  const userData = electron.app.getPath("userData");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ds-import-"));
  try {
    onProgress?.("Unpacking the backup zip...");
    await run("unzip", ["-o", "-q", srcZip, "-d", tempDir]);
    const importedDb = path.join(tempDir, EXPORT_DB_NAME);
    if (!fs.existsSync(importedDb)) {
      throw new Error("Not a Daily Speaking backup: database file missing from the zip");
    }
    const manifestPath = path.join(tempDir, MANIFEST_NAME);
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      if (manifest.app !== "daily-speaking") throw new Error("Not a Daily Speaking backup: wrong manifest");
    }
    onProgress?.("Copying media, recordings and voice cache...");
    let mediaFiles = 0;
    mediaFiles += copyDirInto(path.join(tempDir, "media"), getMediaDir());
    mediaFiles += copyDirInto(path.join(tempDir, "recordings"), getRecordingsDir());
    copyDirInto(path.join(tempDir, "tts_cache"), getTtsCacheDir());
    onProgress?.("Replacing the local database...");
    closeDatabase();
    const dbPath = path.join(userData, "daily-speaking.db");
    for (const suffix of ["", "-wal", "-shm"]) {
      const p = dbPath + suffix;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    fs.copyFileSync(importedDb, dbPath);
    initDatabase();
    onProgress?.("Relinking media paths for this machine...");
    rewritePathColumn("sources", "local_media_path", getMediaDir());
    rewritePathColumn("practice_attempts", "audio_path", getRecordingsDir());
    rewritePathColumn("speaking_answers", "audio_path", getRecordingsDir());
    const db2 = getDb();
    const sessions = db2.prepare("SELECT COUNT(*) as c FROM sessions").get().c;
    const flashcards = db2.prepare("SELECT COUNT(*) as c FROM flashcards").get().c;
    log.info("Import complete:", sessions, "sessions,", flashcards, "flashcards,", mediaFiles, "media files");
    return { sessions, flashcards, mediaFiles };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
function registerDataHandlers(getWindow2) {
  electron.ipcMain.handle("data:export", async () => {
    const win = getWindow2();
    const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const result = await electron.dialog.showSaveDialog({
      title: "Export all Daily Speaking data",
      defaultPath: `daily-speaking-backup-${stamp}.zip`,
      filters: [{ name: "Zip archive", extensions: ["zip"] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const send = (msg) => {
      win?.webContents.send("data:progress", { msg });
    };
    try {
      const exported = await exportAllData(result.filePath, send);
      return { canceled: false, ...exported };
    } catch (err) {
      log.error("Export failed:", err);
      throw err;
    }
  });
  electron.ipcMain.handle("data:import", async () => {
    const win = getWindow2();
    const picked = await electron.dialog.showOpenDialog({
      title: "Import Daily Speaking backup",
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
      properties: ["openFile"]
    });
    const srcZip = picked.filePaths[0];
    if (picked.canceled || !srcZip) return { canceled: true };
    const confirm = await electron.dialog.showMessageBox({
      type: "warning",
      buttons: ["Import and replace", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      message: "Replace all local data?",
      detail: "Importing a backup replaces the current database (sessions, flashcards, history) on this machine. Media files are merged. This cannot be undone."
    });
    if (confirm.response !== 0) return { canceled: true };
    const send = (msg) => {
      win?.webContents.send("data:progress", { msg });
    };
    try {
      const imported = await importAllData(srcZip, send);
      return { canceled: false, ...imported };
    } catch (err) {
      log.error("Import failed:", err);
      throw err;
    }
  });
}
log.initialize();
log.transports.file.level = "info";
let mainWindow = null;
function getWindow() {
  return mainWindow;
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#f8f9ff",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.dailyspeaking.app");
  electron.app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  try {
    initDatabase();
  } catch (err) {
    log.error("Database init failed:", err);
    electron.dialog.showErrorBox("Database Error", String(err));
    electron.app.quit();
    return;
  }
  registerSessionHandlers();
  registerImportHandlers(getWindow);
  registerPracticeHandlers(getWindow);
  registerTranslateHandlers();
  registerFlashcardHandlers();
  registerDashboardHandlers();
  registerSettingsHandlers();
  registerTtsHandlers();
  registerExamHandlers(getWindow);
  registerSpeakingHandlers(getWindow);
  registerGrammarHandlers();
  registerDataHandlers(getWindow);
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
