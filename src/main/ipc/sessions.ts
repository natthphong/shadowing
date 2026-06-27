import { ipcMain } from 'electron'
import { getDb } from '../services/database'

export function registerSessionHandlers(): void {
  ipcMain.handle('session:list', () => {
    const db = getDb()
    return db
      .prepare(
        `SELECT s.*, src.type as source_type, src.url, src.thumbnail
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
    const sets = Object.entries(data)
      .map(([k]) => `${k} = ?`)
      .join(', ')
    const vals = [...Object.values(data), sessionId]
    db.prepare(`UPDATE sessions SET ${sets} WHERE id = ?`).run(...vals)
    return true
  })

  ipcMain.handle('session:analysis:get', (_e, sessionId: string) => {
    return getDb()
      .prepare('SELECT * FROM session_analysis WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(sessionId)
  })
}
