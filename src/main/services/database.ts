import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'

let db: Database.Database

export function getDb(): Database.Database {
  return db
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'daily-speaking.db')
  log.info('DB path:', dbPath)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

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
  `)

  log.info('Database initialized')
}

export function closeDatabase(): void {
  if (db && db.open) {
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.close()
  }
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

export function getMediaDir(): string {
  const dir = path.join(app.getPath('userData'), 'media')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getRecordingsDir(): string {
  const dir = path.join(app.getPath('userData'), 'recordings')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getTtsCacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'tts_cache')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getCachedTranslation(word: string): string | null {
  const row = db.prepare('SELECT translation FROM translation_cache WHERE word = ?').get(word) as
    | { translation: string }
    | undefined
  return row?.translation ?? null
}

export function setCachedTranslation(word: string, translation: string): void {
  db.prepare('INSERT OR REPLACE INTO translation_cache (word, translation, created_at) VALUES (?, ?, ?)').run(
    word, translation, new Date().toISOString()
  )
}
