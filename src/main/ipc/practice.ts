import { ipcMain, BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import { getDb, getRecordingsDir, getSetting } from '../services/database'
import { transcribeAudio } from '../services/whisper'
import { scoreAttempt } from '../services/scoring'
import { analyzeSession } from '../services/ollama'

export function registerPracticeHandlers(getWindow: () => BrowserWindow | null): void {
  // Save a raw audio buffer (base64) to recordings directory, return file path
  ipcMain.handle('recording:save', async (_e, base64: string, filename: string) => {
    const recDir = getRecordingsDir()
    const filePath = path.join(recDir, filename)
    const buffer = Buffer.from(base64, 'base64')
    fs.writeFileSync(filePath, buffer)
    log.info('Recording saved:', filePath, buffer.length, 'bytes')
    return filePath
  })

  ipcMain.handle('practice:attempt:save', async (_e, data: {
    segment_id: string
    user_transcript: string
    audio_path: string
    accuracy_score: number
    pronunciation_score: number
    rhythm_score: number
    speed_score: number
    overall_score: number
    feedback: string
  }) => {
    const db = getDb()
    const id = `att_${uuidv4()}`
    db.prepare(`
      INSERT INTO practice_attempts
        (id, segment_id, user_transcript, audio_path, accuracy_score, pronunciation_score,
         rhythm_score, speed_score, overall_score, feedback, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.segment_id, data.user_transcript, data.audio_path,
      data.accuracy_score, data.pronunciation_score, data.rhythm_score,
      data.speed_score, data.overall_score, data.feedback, new Date().toISOString()
    )
    return { id }
  })

  ipcMain.handle('practice:transcribe-recording', async (
    _e,
    audioPath: string,
    original: string,
    targetDuration: number,
    actualDuration: number
  ) => {
    try {
      log.info('Transcribing recording:', audioPath)
      const result = await transcribeAudio(audioPath)
      const userTranscript = result.text.trim()
      const scores = scoreAttempt(original, userTranscript, targetDuration, actualDuration)
      log.info('Transcription result:', userTranscript, 'Score:', scores.overall_score)
      return { userTranscript, scores }
    } catch (err) {
      log.error('Recording transcription error:', err)
      throw err
    }
  })

  ipcMain.handle('practice:get-attempts', (_e, segmentId: string) => {
    return getDb()
      .prepare('SELECT * FROM practice_attempts WHERE segment_id = ? ORDER BY created_at DESC')
      .all(segmentId)
  })

  ipcMain.handle('practice:session-analyze', async (_e, sessionId: string) => {
    const win = getWindow()
    const db = getDb()

    win?.webContents.send('analysis:progress', { status: 'starting', msg: 'Analyzing session...' })

    const segments = db
      .prepare('SELECT id, original, translate FROM segments WHERE session_id = ? ORDER BY position')
      .all(sessionId) as { id: string; original: string; translate: string }[]

    const attempts = db
      .prepare(`
        SELECT pa.segment_id, pa.user_transcript, pa.overall_score, pa.accuracy_score
        FROM practice_attempts pa
        JOIN segments s ON pa.segment_id = s.id
        WHERE s.session_id = ?
        ORDER BY pa.created_at DESC
      `)
      .all(sessionId) as {
        segment_id: string
        user_transcript: string
        overall_score: number
        accuracy_score: number
      }[]

    // Keep only best attempt per segment
    const topAttempts = new Map<string, typeof attempts[0]>()
    for (const a of attempts) {
      if (!topAttempts.has(a.segment_id)) topAttempts.set(a.segment_id, a)
    }

    win?.webContents.send('analysis:progress', { status: 'running', msg: 'Running AI analysis (may take a minute)...' })

    const analysis = await analyzeSession({
      segments: segments.slice(0, 30),
      attempts: Array.from(topAttempts.values())
    })

    const analysisId = `ana_${uuidv4()}`
    db.prepare('INSERT INTO session_analysis (id, session_id, summary, created_at) VALUES (?, ?, ?, ?)').run(
      analysisId, sessionId, JSON.stringify(analysis), new Date().toISOString()
    )

    const threshold = parseInt(getSetting('low_score_threshold') || '70', 10)
    const parsed = analysis as {
      words_to_practice?: { word: string; translate: string; reason: string; priority: string }[]
      grammar_items?: { name: string; pattern: string; explanation_th: string; examples: unknown[] }[]
    }

    // Save vocabulary
    if (parsed.words_to_practice?.length) {
      const insertVocab = db.prepare(
        'INSERT OR IGNORE INTO vocabulary_items (id, word, translate, source_session_id, reason, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      const tx = db.transaction(() => {
        for (const w of parsed.words_to_practice!) {
          insertVocab.run(`voc_${uuidv4()}`, w.word, w.translate, sessionId, w.reason, w.priority, new Date().toISOString())
        }
      })
      tx()
    }

    // Save / merge grammar items
    if (parsed.grammar_items?.length) {
      for (const g of parsed.grammar_items) {
        const existing = db
          .prepare('SELECT id, source_sessions FROM grammar_items WHERE name = ?')
          .get(g.name) as { id: string; source_sessions: string } | undefined

        if (existing) {
          const sessions = JSON.parse(existing.source_sessions || '[]') as string[]
          if (!sessions.includes(sessionId)) sessions.push(sessionId)
          db.prepare('UPDATE grammar_items SET last_seen_at = ?, source_sessions = ? WHERE id = ?').run(
            new Date().toISOString(), JSON.stringify(sessions), existing.id
          )
        } else {
          db.prepare(
            'INSERT INTO grammar_items (id, name, pattern, explanation_th, examples, last_seen_at, source_sessions) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(
            `grm_${uuidv4()}`, g.name, g.pattern, g.explanation_th,
            JSON.stringify(g.examples || []), new Date().toISOString(), JSON.stringify([sessionId])
          )
        }
      }
    }

    // Auto-create flashcards for low-score segments
    const lowSegs = segments.filter((s) => {
      const att = topAttempts.get(s.id)
      return att && att.overall_score < threshold
    })

    if (lowSegs.length > 0) {
      const insertCard = db.prepare(
        'INSERT OR IGNORE INTO flashcards (id, type, front, back, source_segment_id, session_id, next_due_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      const tomorrow = new Date(Date.now() + 86400000).toISOString()
      const tx = db.transaction(() => {
        for (const s of lowSegs) {
          insertCard.run(`card_${uuidv4()}`, 'sentence_speaking', s.original, s.translate || s.original, s.id, sessionId, tomorrow)
        }
      })
      tx()
    }

    win?.webContents.send('analysis:progress', { status: 'done', msg: 'Analysis complete!' })
    return { analysisId, analysis, flashcardsCreated: lowSegs.length }
  })
}
