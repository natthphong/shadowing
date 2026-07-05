import { ipcMain } from 'electron'
import { getDb } from '../services/database'

export function registerDashboardHandlers(): void {
  ipcMain.handle('dashboard:stats', () => {
    const db = getDb()
    const now = new Date().toISOString()

    const totalSessions = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c
    const totalSegments = (db.prepare('SELECT COUNT(*) as c FROM segments').get() as { c: number }).c
    const totalAttempts = (db.prepare('SELECT COUNT(*) as c FROM practice_attempts').get() as { c: number }).c
    const avgScore = (db.prepare('SELECT AVG(overall_score) as a FROM practice_attempts').get() as { a: number | null }).a
    const totalVocab = (db.prepare('SELECT COUNT(*) as c FROM vocabulary_items').get() as { c: number }).c
    const totalGrammar = (db.prepare('SELECT COUNT(*) as c FROM grammar_items').get() as { c: number }).c
    const dueFlashcards = (db.prepare('SELECT COUNT(*) as c FROM flashcards WHERE next_due_at <= ? OR next_due_at IS NULL').get(now) as { c: number }).c
    const totalFlashcards = (db.prepare('SELECT COUNT(*) as c FROM flashcards').get() as { c: number }).c

    const recentSessions = db
      .prepare(`
        SELECT s.id, s.title, s.created_at, s.completion_percentage, s.total_segments,
               AVG(pa.overall_score) as avg_score
        FROM sessions s
        LEFT JOIN segments seg ON s.id = seg.session_id
        LEFT JOIN practice_attempts pa ON seg.id = pa.segment_id
        GROUP BY s.id
        ORDER BY s.created_at DESC
        LIMIT 5
      `)
      .all()

    const scoreByDay = db
      .prepare(`
        SELECT date(pa.created_at) as day, AVG(pa.overall_score) as avg_score, COUNT(*) as count
        FROM practice_attempts pa
        WHERE pa.created_at >= datetime('now', '-14 days')
        GROUP BY date(pa.created_at)
        ORDER BY day ASC
      `)
      .all()

    const topMissedWords = db
      .prepare(`
        SELECT word, COUNT(*) as c FROM vocabulary_items
        WHERE priority = 'high'
        GROUP BY word ORDER BY c DESC LIMIT 10
      `)
      .all()

    const speaking = db
      .prepare('SELECT COUNT(*) as c, AVG(score) as a FROM speaking_answers')
      .get() as { c: number; a: number | null }
    const speakingQuestions = (db.prepare('SELECT COUNT(*) as c FROM speaking_questions').get() as { c: number }).c

    // One row per calendar day with any learning activity (practice, SRS review, speaking, exams)
    const activityByDay = db
      .prepare(`
        SELECT day, SUM(c) as count FROM (
          SELECT date(created_at) as day, COUNT(*) as c FROM practice_attempts GROUP BY day
          UNION ALL SELECT date(reviewed_at) as day, COUNT(*) as c FROM review_history GROUP BY day
          UNION ALL SELECT date(created_at) as day, COUNT(*) as c FROM speaking_answers GROUP BY day
          UNION ALL SELECT date(completed_at) as day, COUNT(*) as c FROM quiz_attempts GROUP BY day
        )
        WHERE day IS NOT NULL
        GROUP BY day ORDER BY day ASC
      `)
      .all() as { day: string; count: number }[]

    const dayMs = 86400000
    const days = activityByDay.map((r) => r.day)
    const daySet = new Set(days)
    const todayStr = new Date().toISOString().slice(0, 10)

    let currentStreak = 0
    // Streak still counts if today has no activity yet — anchor on today or yesterday
    let cursor = daySet.has(todayStr)
      ? Date.parse(todayStr)
      : Date.parse(todayStr) - dayMs
    while (daySet.has(new Date(cursor).toISOString().slice(0, 10))) {
      currentStreak += 1
      cursor -= dayMs
    }

    let bestStreak = 0
    let runLength = 0
    let prevTime = 0
    for (const day of days) {
      const t = Date.parse(day)
      runLength = prevTime && t - prevTime === dayMs ? runLength + 1 : 1
      bestStreak = Math.max(bestStreak, runLength)
      prevTime = t
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
    }
  })

  ipcMain.handle('grammar:list', () => {
    return getDb()
      .prepare('SELECT * FROM grammar_items ORDER BY last_seen_at DESC')
      .all()
  })

  ipcMain.handle('vocabulary:list', () => {
    return getDb()
      .prepare('SELECT * FROM vocabulary_items ORDER BY created_at DESC')
      .all()
  })
}
