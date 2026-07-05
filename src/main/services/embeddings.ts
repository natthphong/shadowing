// Local vector search over sessions and speaking questions using bge-m3
// embeddings (via Ollama). Vectors are cached in the `embeddings` table and
// created lazily the first time a search runs, so imports stay fast and the
// feature degrades gracefully to substring search when Ollama is offline.
import log from 'electron-log'
import { getDb } from './database'
import { ollamaEmbed } from './ollama'

export type EmbeddingKind = 'session' | 'speaking_question'

function storeEmbeddings(kind: EmbeddingKind, items: { ref_id: string; vector: number[] }[]): void {
  const db = getDb()
  const insert = db.prepare(
    'INSERT OR REPLACE INTO embeddings (kind, ref_id, vector, created_at) VALUES (?, ?, ?, ?)'
  )
  const tx = db.transaction(() => {
    for (const item of items) {
      insert.run(kind, item.ref_id, JSON.stringify(item.vector), new Date().toISOString())
    }
  })
  tx()
}

function missingRows(kind: EmbeddingKind): { ref_id: string; text: string }[] {
  const db = getDb()
  if (kind === 'session') {
    const rows = db.prepare(`
      SELECT s.id as ref_id, s.title,
             (SELECT group_concat(original, ' ') FROM (
                SELECT original FROM segments WHERE session_id = s.id ORDER BY position LIMIT 12
             )) as excerpt
      FROM sessions s
      WHERE NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.kind = 'session' AND e.ref_id = s.id)
    `).all() as { ref_id: string; title: string; excerpt: string | null }[]
    return rows.map((r) => ({ ref_id: r.ref_id, text: `${r.title}\n${r.excerpt || ''}`.slice(0, 4000) }))
  }
  const rows = getDb().prepare(`
    SELECT q.id as ref_id, q.question_en, q.question_th
    FROM speaking_questions q
    WHERE NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.kind = 'speaking_question' AND e.ref_id = q.id)
  `).all() as { ref_id: string; question_en: string; question_th: string | null }[]
  return rows.map((r) => ({ ref_id: r.ref_id, text: `${r.question_en}\n${r.question_th || ''}` }))
}

async function ensureEmbeddings(kind: EmbeddingKind): Promise<void> {
  const missing = missingRows(kind)
  if (missing.length === 0) return
  log.info(`Embedding ${missing.length} ${kind} rows for vector search`)
  // Batch to keep each Ollama request reasonable
  for (let i = 0; i < missing.length; i += 20) {
    const batch = missing.slice(i, i + 20)
    const vectors = await ollamaEmbed(batch.map((b) => b.text))
    storeEmbeddings(kind, batch.map((b, j) => ({ ref_id: b.ref_id, vector: vectors[j] })))
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom > 0 ? dot / denom : 0
}

/**
 * Semantic search: returns ref_ids ranked by cosine similarity to the query.
 * Throws when Ollama/bge-m3 is unavailable — callers fall back to LIKE search.
 */
export async function vectorSearchIds(kind: EmbeddingKind, query: string): Promise<string[]> {
  await ensureEmbeddings(kind)
  const [queryVector] = await ollamaEmbed([query])

  const rows = getDb()
    .prepare('SELECT ref_id, vector FROM embeddings WHERE kind = ?')
    .all(kind) as { ref_id: string; vector: string }[]

  return rows
    .map((row) => ({ ref_id: row.ref_id, score: cosine(queryVector, JSON.parse(row.vector) as number[]) }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.ref_id)
}
