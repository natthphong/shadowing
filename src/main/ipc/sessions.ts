import { ipcMain } from 'electron'
import { getDb } from '../services/database'

export function registerSessionHandlers(): void {
  ipcMain.handle('session:list', () => {
    const db = getDb()
    return db
      .prepare(
        `SELECT s.*, src.type as source_type, src.url, src.thumbnail,
                (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.session_id = s.id) as exam_attempt_count,
                EXISTS(SELECT 1 FROM session_quizzes sq WHERE sq.session_id = s.id) as has_exam
         FROM sessions s
         LEFT JOIN sources src ON s.source_id = src.id
         ORDER BY s.created_at DESC`
      )
      .all()
  })

  ipcMain.handle('session:get', (_e, sessionId: string) => {
    const db = getDb()
    const session = db
      .prepare(
        `SELECT s.*, src.type as source_type, src.url, src.thumbnail, src.local_media_path
         FROM sessions s LEFT JOIN sources src ON s.source_id = src.id
         WHERE s.id = ?`
      )
      .get(sessionId)

    if (!session) return null

    const segments = db
      .prepare('SELECT * FROM segments WHERE session_id = ? ORDER BY position')
      .all(sessionId)

    const attempts = db
      .prepare(
        `SELECT pa.* FROM practice_attempts pa
         JOIN segments seg ON pa.segment_id = seg.id
         WHERE seg.session_id = ?
         ORDER BY pa.created_at DESC`
      )
      .all(sessionId)

    return { ...session, segments, attempts }
  })

  ipcMain.handle('session:delete', (_e, sessionId: string) => {
    const db = getDb()
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
    return true
  })

  ipcMain.handle('session:update-progress', (_e, sessionId: string, data: {
    completion_percentage?: number
    practice_duration_seconds?: number
    completed_at?: string
  }) => {
    const db = getDb()
    const current = db
      .prepare('SELECT completion_percentage, practice_duration_seconds, completed_at FROM sessions WHERE id = ?')
      .get(sessionId) as {
        completion_percentage: number
        practice_duration_seconds: number
        completed_at: string | null
      } | undefined
    if (!current) return false

    const requestedCompletion = typeof data.completion_percentage === 'number'
      ? Math.max(0, Math.min(100, data.completion_percentage))
      : current.completion_percentage
    const completion = Math.max(current.completion_percentage, requestedCompletion)
    const duration = typeof data.practice_duration_seconds === 'number'
      ? Math.max(current.practice_duration_seconds, Math.round(data.practice_duration_seconds))
      : current.practice_duration_seconds
    const completedAt = current.completed_at || (completion >= 100 ? data.completed_at || new Date().toISOString() : null)

    db.prepare(`
      UPDATE sessions
      SET completion_percentage = ?, practice_duration_seconds = ?, completed_at = ?
      WHERE id = ?
    `).run(completion, duration, completedAt, sessionId)
    return true
  })

  ipcMain.handle('session:analysis:get', (_e, sessionId: string) => {
    return getDb()
      .prepare('SELECT * FROM session_analysis WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(sessionId)
  })
}
