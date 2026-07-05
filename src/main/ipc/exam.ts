import { BrowserWindow, ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../services/database'
import { generateExamQuiz } from '../services/exam'
import { ExamQuestion, gradeExam } from '../services/examUtils'

type QuizRow = {
  id: string
  session_id: string
  title: string
  questions: string
  tags: string
  model: string | null
  created_at: string
}

type AttemptRow = {
  id: string
  quiz_id: string
  session_id: string
  answers: string
  correct_count: number
  total_questions: number
  score: number
  completed_at: string
}

function parseQuestions(row: QuizRow): ExamQuestion[] {
  return JSON.parse(row.questions) as ExamQuestion[]
}

function publicQuiz(row: QuizRow): Record<string, unknown> {
  return {
    id: row.id,
    session_id: row.session_id,
    title: row.title,
    tags: JSON.parse(row.tags || '[]') as string[],
    model: row.model,
    created_at: row.created_at,
    questions: parseQuestions(row).map(({ correctIndex: _correctIndex, explanation: _explanation, ...question }) => question)
  }
}

function attemptSummary(row: AttemptRow): Record<string, unknown> {
  return {
    id: row.id,
    quiz_id: row.quiz_id,
    session_id: row.session_id,
    correct_count: row.correct_count,
    total_questions: row.total_questions,
    score: row.score,
    completed_at: row.completed_at
  }
}

function reviewAttempt(attempt: AttemptRow, quiz: QuizRow): Record<string, unknown> {
  const answers = JSON.parse(attempt.answers) as Array<number | null>
  const questions = parseQuestions(quiz)
  return {
    attempt: attemptSummary(attempt),
    quiz: {
      id: quiz.id,
      session_id: quiz.session_id,
      title: quiz.title,
      tags: JSON.parse(quiz.tags || '[]') as string[],
      model: quiz.model,
      created_at: quiz.created_at,
      questions: questions.map((question, index) => ({
        ...question,
        selectedIndex: answers[index] ?? null,
        isCorrect: answers[index] === question.correctIndex
      }))
    }
  }
}

export function registerExamHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('exam:session:get', (_event, sessionId: string) => {
    const db = getDb()
    const quiz = db
      .prepare('SELECT * FROM session_quizzes WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(sessionId) as QuizRow | undefined
    const attempts = db
      .prepare('SELECT * FROM quiz_attempts WHERE session_id = ? ORDER BY completed_at DESC')
      .all(sessionId) as AttemptRow[]
    return { quiz: quiz ? publicQuiz(quiz) : null, attempts: attempts.map(attemptSummary) }
  })

  ipcMain.handle('exam:generate', async (_event, sessionId: string, questionCount = 7) => {
    const db = getDb()
    const win = getWindow()
    const session = db
      .prepare('SELECT id, title, completion_percentage FROM sessions WHERE id = ?')
      .get(sessionId) as { id: string; title: string; completion_percentage: number } | undefined
    if (!session) throw new Error('Session not found')
    if (session.completion_percentage < 100) throw new Error('Complete the session before taking the exam')

    win?.webContents.send('exam:progress', { status: 'reading', msg: 'Reading the completed transcript...' })
    const segments = db
      .prepare('SELECT position, original, translate FROM segments WHERE session_id = ? ORDER BY position')
      .all(sessionId) as { position: number; original: string; translate: string }[]
    if (segments.length === 0) throw new Error('This session has no transcript to quiz')

    win?.webContents.send('exam:progress', { status: 'generating', msg: 'AI is creating comprehension questions...' })
    const { exam, model } = await generateExamQuiz({
      sessionTitle: session.title,
      segments,
      questionCount
    })

    win?.webContents.send('exam:progress', { status: 'saving', msg: 'Saving the exam for future retakes...' })
    const id = `quiz_${uuidv4()}`
    const createdAt = new Date().toISOString()
    db.prepare(`
      INSERT INTO session_quizzes (id, session_id, title, questions, tags, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, exam.title, JSON.stringify(exam.questions), JSON.stringify(exam.tags), model, createdAt)

    const row = db.prepare('SELECT * FROM session_quizzes WHERE id = ?').get(id) as QuizRow
    win?.webContents.send('exam:progress', { status: 'done', msg: 'Exam ready!' })
    return publicQuiz(row)
  })

  ipcMain.handle('exam:submit', (_event, quizId: string, rawAnswers: Array<number | null>) => {
    const db = getDb()
    const quiz = db.prepare('SELECT * FROM session_quizzes WHERE id = ?').get(quizId) as QuizRow | undefined
    if (!quiz) throw new Error('Exam not found')
    const questions = parseQuestions(quiz)
    const answers = questions.map((_question, index) => {
      const answer = rawAnswers[index]
      return Number.isInteger(answer) && answer! >= 0 && answer! <= 3 ? answer : null
    })
    const grade = gradeExam(questions, answers)
    const attemptId = `qatt_${uuidv4()}`
    const completedAt = new Date().toISOString()
    db.prepare(`
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
    )
    const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(attemptId) as AttemptRow
    return reviewAttempt(attempt, quiz)
  })

  ipcMain.handle('exam:attempt:get', (_event, attemptId: string) => {
    const db = getDb()
    const attempt = db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(attemptId) as AttemptRow | undefined
    if (!attempt) return null
    const quiz = db.prepare('SELECT * FROM session_quizzes WHERE id = ?').get(attempt.quiz_id) as QuizRow | undefined
    return quiz ? reviewAttempt(attempt, quiz) : null
  })

  ipcMain.handle('exam:history', () => {
    const rows = getDb().prepare(`
      SELECT qa.id, qa.quiz_id, qa.session_id, qa.correct_count, qa.total_questions,
             qa.score, qa.completed_at, s.title as session_title,
             sq.title as quiz_title, sq.tags
      FROM quiz_attempts qa
      JOIN sessions s ON s.id = qa.session_id
      JOIN session_quizzes sq ON sq.id = qa.quiz_id
      ORDER BY qa.completed_at DESC
    `).all() as Array<Record<string, unknown> & { tags: string }>
    return rows.map((row) => ({ ...row, tags: JSON.parse(row.tags || '[]') as string[] }))
  })
}
