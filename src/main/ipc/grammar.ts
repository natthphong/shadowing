import { ipcMain } from 'electron'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { getDb, getSetting } from '../services/database'
import {
  GrammarInfo,
  normalizeGrammar,
  generateGrammarQuestion,
  evaluateGrammarAnswer
} from '../services/grammarPractice'

type GrammarRow = GrammarInfo & { id: string; source_sessions: string }

function getGrammar(grammarId: string): GrammarRow {
  const row = getDb()
    .prepare('SELECT id, name, pattern, explanation_th, examples, source_sessions FROM grammar_items WHERE id = ?')
    .get(grammarId) as GrammarRow | undefined
  if (!row) throw new Error('Grammar topic not found')
  return row
}

export function registerGrammarHandlers(): void {
  // Add a topic from free-form notes: AI identifies the grammar + examples
  ipcMain.handle('grammar:add', async (_e, text: string) => {
    if (!text.trim()) throw new Error('Empty grammar notes')
    const db = getDb()
    const normalized = await normalizeGrammar(text)

    const existing = db
      .prepare('SELECT id FROM grammar_items WHERE name = ? COLLATE NOCASE')
      .get(normalized.name) as { id: string } | undefined
    if (existing) {
      db.prepare('UPDATE grammar_items SET pattern = ?, explanation_th = ?, examples = ?, last_seen_at = ? WHERE id = ?')
        .run(normalized.pattern, normalized.explanation_th, JSON.stringify(normalized.examples), new Date().toISOString(), existing.id)
      return { id: existing.id, merged: true, name: normalized.name }
    }

    const id = `grm_${uuidv4()}`
    db.prepare(
      'INSERT INTO grammar_items (id, name, pattern, explanation_th, examples, last_seen_at, source_sessions) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, normalized.name, normalized.pattern, normalized.explanation_th, JSON.stringify(normalized.examples), new Date().toISOString(), '[]')
    return { id, merged: false, name: normalized.name }
  })

  ipcMain.handle('grammar:delete', (_e, grammarId: string) => {
    getDb().prepare('DELETE FROM grammar_items WHERE id = ?').run(grammarId)
    return true
  })

  // Deterministic daily selection: N topics per calendar day, rotated by a
  // date-seeded hash so every day gets a different mix.
  ipcMain.handle('grammar:daily-due', () => {
    const db = getDb()
    const count = Math.max(1, parseInt(getSetting('grammar_daily_count') || '4', 10) || 4)
    const today = new Date().toISOString().slice(0, 10)

    const all = db.prepare('SELECT * FROM grammar_items').all() as (GrammarRow & Record<string, unknown>)[]
    const picked = all
      .map((g) => ({ g, key: crypto.createHash('md5').update(`${today}:${g.id}`).digest('hex') }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(0, count)
      .map(({ g }) => g)

    const practicedToday = new Set(
      (db.prepare("SELECT DISTINCT grammar_id FROM grammar_practice_history WHERE date(created_at) = date('now')").all() as { grammar_id: string }[])
        .map((r) => r.grammar_id)
    )
    return picked.map((g) => ({ ...g, practiced_today: practicedToday.has(g.id) }))
  })

  // One speaking challenge for a topic (avoids repeating recent questions)
  ipcMain.handle('grammar:practice:question', async (_e, grammarId: string) => {
    const grammar = getGrammar(grammarId)
    const recent = (getDb()
      .prepare('SELECT DISTINCT question FROM grammar_practice_history WHERE grammar_id = ? ORDER BY created_at DESC LIMIT 8')
      .all(grammarId) as { question: string }[]).map((r) => r.question)
    return generateGrammarQuestion(grammar, recent)
  })

  ipcMain.handle('grammar:practice:evaluate', async (
    _e,
    grammarId: string,
    question: string,
    transcript: string,
    audioPath?: string
  ) => {
    if (!transcript.trim()) throw new Error('Empty answer transcript')
    const grammar = getGrammar(grammarId)
    const evaluation = await evaluateGrammarAnswer({ grammar, question, transcript: transcript.trim() })

    const db = getDb()
    const id = `gpa_${uuidv4()}`
    db.prepare(`
      INSERT INTO grammar_practice_history
        (id, grammar_id, question, transcript, audio_path, score, grammar_ok, used_target, feedback_th, suggested_answer, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, grammarId, question, transcript.trim(), audioPath || null,
      evaluation.score, evaluation.grammar_ok ? 1 : 0, evaluation.used_target ? 1 : 0,
      evaluation.feedback_th,
      JSON.stringify({ corrected: evaluation.corrected_sentence, suggested: evaluation.suggested_answer }),
      new Date().toISOString()
    )
    db.prepare('UPDATE grammar_items SET review_count = review_count + 1, last_seen_at = ? WHERE id = ?')
      .run(new Date().toISOString(), grammarId)

    return { attemptId: id, ...evaluation }
  })

  ipcMain.handle('grammar:practice:history', (_e, grammarId?: string) => {
    const db = getDb()
    if (grammarId) {
      return db
        .prepare('SELECT * FROM grammar_practice_history WHERE grammar_id = ? ORDER BY created_at DESC LIMIT 100')
        .all(grammarId)
    }
    return db.prepare(`
      SELECT h.*, g.name as grammar_name
      FROM grammar_practice_history h
      JOIN grammar_items g ON g.id = h.grammar_id
      ORDER BY h.created_at DESC LIMIT 200
    `).all()
  })
}
