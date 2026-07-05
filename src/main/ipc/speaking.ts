import { BrowserWindow, ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import log from 'electron-log'
import { getDb } from '../services/database'
import { generateSpeakingQuestions, evaluateSpeakingAnswer } from '../services/speaking'
import { transcribeAudio } from '../services/whisper'

type QuestionRow = {
  id: string
  session_id: string
  question_en: string
  question_th: string | null
  position: number
  batch_id: string | null
  model: string | null
  created_at: string
}

export function registerSpeakingHandlers(getWindow: () => BrowserWindow | null): void {
  // Sessions eligible for speaking practice (fully practiced)
  ipcMain.handle('speaking:sessions', () => {
    return getDb().prepare(`
      SELECT s.id, s.title, s.created_at, s.total_segments,
             (SELECT COUNT(*) FROM speaking_questions q WHERE q.session_id = s.id) as question_count
      FROM sessions s
      WHERE s.completion_percentage >= 100
      ORDER BY s.created_at DESC
    `).all()
  })

  ipcMain.handle('speaking:generate', async (_event, sessionId: string, questionCount = 5) => {
    const db = getDb()
    const win = getWindow()
    const session = db
      .prepare('SELECT id, title, completion_percentage FROM sessions WHERE id = ?')
      .get(sessionId) as { id: string; title: string; completion_percentage: number } | undefined
    if (!session) throw new Error('Session not found')
    if (session.completion_percentage < 100) throw new Error('Complete the session before speaking practice')

    win?.webContents.send('speaking:progress', { status: 'reading', msg: 'Reading the transcript...' })
    const segments = db
      .prepare('SELECT position, original FROM segments WHERE session_id = ? ORDER BY position')
      .all(sessionId) as { position: number; original: string }[]
    if (segments.length === 0) throw new Error('This session has no transcript')

    win?.webContents.send('speaking:progress', { status: 'generating', msg: 'AI is writing speaking questions...' })
    const { questions, model } = await generateSpeakingQuestions({
      sessionTitle: session.title,
      segments,
      questionCount
    })

    const batchId = `sqb_${uuidv4()}`
    const createdAt = new Date().toISOString()
    const insert = db.prepare(`
      INSERT INTO speaking_questions (id, session_id, question_en, question_th, position, batch_id, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const rows: QuestionRow[] = []
    const tx = db.transaction(() => {
      questions.forEach((q, index) => {
        const id = `spq_${uuidv4()}`
        insert.run(id, sessionId, q.question_en, q.question_th, index, batchId, model, createdAt)
        rows.push({
          id, session_id: sessionId, question_en: q.question_en, question_th: q.question_th,
          position: index, batch_id: batchId, model, created_at: createdAt
        })
      })
    })
    tx()

    win?.webContents.send('speaking:progress', { status: 'done', msg: 'Questions ready!' })
    return { batchId, questions: rows }
  })

  // Whisper-transcribe a saved recording (no shadowing score — free-form answer)
  ipcMain.handle('speaking:transcribe', async (_event, audioPath: string) => {
    log.info('Speaking: transcribing answer', audioPath)
    const result = await transcribeAudio(audioPath)
    return { transcript: result.text.trim() }
  })

  ipcMain.handle('speaking:evaluate', async (_event, questionId: string, transcript: string, audioPath?: string) => {
    const db = getDb()
    const question = db.prepare('SELECT * FROM speaking_questions WHERE id = ?').get(questionId) as
      | QuestionRow
      | undefined
    if (!question) throw new Error('Question not found')
    if (!transcript.trim()) throw new Error('Empty answer transcript')

    const win = getWindow()
    win?.webContents.send('speaking:progress', { status: 'evaluating', msg: 'AI is checking your grammar...' })
    const { evaluation } = await evaluateSpeakingAnswer({
      question: question.question_en,
      transcript: transcript.trim()
    })

    const id = `spa_${uuidv4()}`
    db.prepare(`
      INSERT INTO speaking_answers
        (id, question_id, transcript, audio_path, score, grammar_ok, feedback_th, suggested_answer, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, questionId, transcript.trim(), audioPath || null, evaluation.score,
      evaluation.grammar_ok ? 1 : 0, evaluation.feedback_th,
      JSON.stringify({ corrected: evaluation.corrected_sentence, suggested: evaluation.suggested_answer }),
      new Date().toISOString()
    )

    win?.webContents.send('speaking:progress', { status: 'done', msg: 'Feedback ready!' })
    return { answerId: id, ...evaluation }
  })

  // All answers for one question (history of retries)
  ipcMain.handle('speaking:answers', (_event, questionId: string) => {
    return getDb()
      .prepare('SELECT * FROM speaking_answers WHERE question_id = ? ORDER BY created_at DESC')
      .all(questionId)
  })

  // Question history across sessions, with answer stats
  ipcMain.handle('speaking:history', () => {
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
    `).all()
  })
}
