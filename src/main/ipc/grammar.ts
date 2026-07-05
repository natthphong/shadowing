import { ipcMain } from 'electron'
import { getDb, getSetting } from '../services/database'
import { ollamaChat } from '../services/ollama'

type GrammarRow = {
  id: string
  name: string
  pattern: string | null
  explanation_th: string | null
  examples: string
}

export function registerGrammarHandlers(): void {
  ipcMain.handle('grammar:chat', async (_e, grammarId: string, messages: { role: 'user' | 'assistant'; content: string }[]) => {
    const db = getDb()
    const grammar = db
      .prepare('SELECT id, name, pattern, explanation_th, examples FROM grammar_items WHERE id = ?')
      .get(grammarId) as GrammarRow | undefined
    if (!grammar) throw new Error('Grammar topic not found')

    // First message of a practice session counts as a review of this topic
    if (messages.filter((m) => m.role === 'user').length <= 1) {
      db.prepare('UPDATE grammar_items SET review_count = review_count + 1, last_seen_at = ? WHERE id = ?')
        .run(new Date().toISOString(), grammarId)
    }

    let examples = ''
    try {
      const parsed = JSON.parse(grammar.examples || '[]') as { original: string; translate: string }[]
      examples = parsed.map((ex) => `- ${ex.original}${ex.translate ? ` (${ex.translate})` : ''}`).join('\n')
    } catch {
      examples = ''
    }

    const system = `You are a friendly English tutor coaching a Thai learner to actively USE this grammar topic in speech:

Topic: ${grammar.name}
${grammar.pattern ? `Pattern: ${grammar.pattern}` : ''}
${grammar.explanation_th ? `Thai explanation: ${grammar.explanation_th}` : ''}
${examples ? `Examples:\n${examples}` : ''}

Coaching rules:
- Explain briefly in Thai, but all example sentences and challenges are in English.
- Each turn: give ONE short situation or question that forces the learner to answer in English using this grammar.
- When the learner answers, first say whether the grammar was used correctly. If wrong, show the corrected sentence and explain the fix in 1-2 Thai sentences. Then give the next challenge.
- Keep every reply under 130 words. Never answer the challenge for the learner. Do not use markdown tables.`

    const model = getSetting('analysis_model') || 'qwen3.6:27b'
    const reply = await ollamaChat(
      model,
      [{ role: 'system', content: system }, ...messages],
      { temperature: 0.5, num_ctx: 8192 }
    )
    return { reply: reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(), model }
  })
}
