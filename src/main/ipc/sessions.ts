import { ipcMain } from 'electron'
import log from 'electron-log'
import { getDb } from '../services/database'
import { vectorSearchIds } from '../services/embeddings'

export function registerSessionHandlers(): void {
  ipcMain.handle('session:list', async (_e, opts?: { query?: string; page?: number; pageSize?: number }) => {
    const db = getDb()
    const query = (opts?.query || '').trim()
    const page = Math.max(1, opts?.page || 1)
    const pageSize = Math.max(1, Math.min(50, opts?.pageSize || 10))

    const all = db
      .prepare(
        `SELECT s.*, src.type as source_type, src.url, src.thumbnail,
                (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.session_id = s.id) as exam_attempt_count,
                EXISTS(SELECT 1 FROM session_quizzes sq WHERE sq.session_id = s.id) as has_exam
         FROM sessions s
         LEFT JOIN sources src ON s.source_id = src.id
         ORDER BY s.created_at DESC`
      )
      .all() as Record<string, unknown>[]

    let filtered = all
    if (query) {
      try {
        // Semantic search over title + transcript excerpt (bge-m3)
        const ranked = await vectorSearchIds('session', query)
        const position = new Map(ranked.map((id, index) => [id, index]))
        filtered = all
          .filter((row) => position.has(row.id as string))
          .sort((a, b) => position.get(a.id as string)! - position.get(b.id as string)!)
          .slice(0, 20)
      } catch (err) {
        log.warn('Vector search unavailable, falling back to substring match:', err)
        const q = query.toLowerCase()
        filtered = all.filter((row) => String(row.title || '').toLowerCase().includes(q))
      }
    }

    const total = filtered.length
    const items = filtered.slice((page - 1) * pageSize, page * pageSize)
    return { items, total, page, pageSize }
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
