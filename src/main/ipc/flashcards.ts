import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../services/database'

export function registerFlashcardHandlers(): void {
  ipcMain.handle('flashcard:list', (_e, type?: string) => {
    const db = getDb()
    if (type) {
      return db.prepare('SELECT * FROM flashcards WHERE type = ? ORDER BY next_due_at ASC').all(type)
    }
    return db.prepare('SELECT * FROM flashcards ORDER BY next_due_at ASC').all()
  })

  ipcMain.handle('flashcard:due', () => {
    const now = new Date().toISOString()
    return getDb()
      .prepare('SELECT * FROM flashcards WHERE next_due_at <= ? OR next_due_at IS NULL ORDER BY next_due_at ASC LIMIT 50')
      .all(now)
  })

  ipcMain.handle('flashcard:review', (_e, cardId: string, rating: 'very_easy' | 'easy' | 'hard' | 'very_hard') => {
    const db = getDb()
    const card = db.prepare('SELECT * FROM flashcards WHERE id = ?').get(cardId) as
      | { ease_factor: number; interval_days: number; review_count: number; correct_count: number }
      | undefined

    if (!card) return false

    let { ease_factor, interval_days } = card
    const isCorrect = rating === 'very_easy' || rating === 'easy'

    // SM-2 inspired algorithm
    const easeAdjust: Record<string, number> = {
      very_easy: 0.1,
      easy: 0,
      hard: -0.15,
      very_hard: -0.3
    }
    ease_factor = Math.max(1.3, ease_factor + easeAdjust[rating])

    const intervalMultiplier: Record<string, number> = {
      very_easy: 4,
      easy: 2.5,
      hard: 1,
      very_hard: 0.25
    }

    if (rating === 'very_hard') {
      interval_days = 0.25 // 6 hours
    } else {
      interval_days = Math.max(1, interval_days * intervalMultiplier[rating])
    }

    const nextDue = new Date(Date.now() + interval_days * 86400000).toISOString()

    db.prepare(`
      UPDATE flashcards SET
        ease_factor = ?, interval_days = ?, next_due_at = ?,
        last_reviewed_at = ?, review_count = review_count + 1,
        correct_count = correct_count + ?
      WHERE id = ?
    `).run(ease_factor, interval_days, nextDue, new Date().toISOString(), isCorrect ? 1 : 0, cardId)

    db.prepare('INSERT INTO review_history (id, flashcard_id, rating, reviewed_at) VALUES (?, ?, ?, ?)').run(
      `rev_${uuidv4()}`, cardId, rating, new Date().toISOString()
    )

    return true
  })

  ipcMain.handle('flashcard:create', (_e, data: {
    type: string
    front: string
    back: string
    source_segment_id?: string
    session_id?: string
  }) => {
    const db = getDb()
    const id = `card_${uuidv4()}`
    const tomorrow = new Date(Date.now() + 86400000).toISOString()
    db.prepare(
      'INSERT INTO flashcards (id, type, front, back, source_segment_id, session_id, next_due_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, data.type, data.front, data.back, data.source_segment_id || null, data.session_id || null, tomorrow)
    return { id }
  })

  ipcMain.handle('flashcard:exists', (_e, front: string) => {
    const row = getDb().prepare('SELECT id FROM flashcards WHERE front = ? LIMIT 1').get(front)
    return !!row
  })

  ipcMain.handle('flashcard:delete', (_e, cardId: string) => {
    getDb().prepare('DELETE FROM flashcards WHERE id = ?').run(cardId)
    return true
  })

  ipcMain.handle('flashcard:stats', () => {
    const db = getDb()
    const now = new Date().toISOString()
    const total = (db.prepare('SELECT COUNT(*) as c FROM flashcards').get() as { c: number }).c
    const due = (db.prepare('SELECT COUNT(*) as c FROM flashcards WHERE next_due_at <= ? OR next_due_at IS NULL').get(now) as { c: number }).c
    const byType = db.prepare('SELECT type, COUNT(*) as c FROM flashcards GROUP BY type').all()
    return { total, due, byType }
  })
}
