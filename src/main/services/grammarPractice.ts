import log from 'electron-log'
import { extractJSON } from './ollama'
import { aiGenerate } from './ai'

export interface GrammarInfo {
  name: string
  pattern: string | null
  explanation_th: string | null
  examples: string // JSON string
}

export interface NormalizedGrammar {
  name: string
  pattern: string
  explanation_th: string
  examples: { original: string; translate: string }[]
}

export interface GrammarQuestion {
  question_en: string
  question_th: string
}

export interface GrammarEvaluation {
  score: number
  grammar_ok: boolean
  used_target: boolean
  feedback_th: string
  corrected_sentence: string
  suggested_answer: string
}

function clampScore(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function grammarContext(grammar: GrammarInfo): string {
  let examples = ''
  try {
    const parsed = JSON.parse(grammar.examples || '[]') as { original: string; translate: string }[]
    examples = parsed.map((ex) => `- ${ex.original}`).join('\n')
  } catch { /* ignore */ }
  return `Grammar topic: ${grammar.name}
${grammar.pattern ? `Pattern: ${grammar.pattern}` : ''}
${grammar.explanation_th ? `Thai explanation: ${grammar.explanation_th}` : ''}
${examples ? `Examples:\n${examples}` : ''}`
}

/** Turn free-form user notes about a grammar point into a library entry. */
export async function normalizeGrammar(text: string): Promise<NormalizedGrammar> {
  const prompt = `A Thai learner of English pasted notes about a grammar point they studied elsewhere. Identify the grammar topic and produce a clean library entry.

Learner's notes:
${text.slice(0, 4000)}

Return ONLY strict JSON, no markdown:
{
  "name": "concise English name of the grammar topic (e.g. 'Present Perfect for life experience')",
  "pattern": "short formula, e.g. 'have/has + V3'",
  "explanation_th": "2-3 sentence explanation in Thai of what it means and when to use it",
  "examples": [
    {"original": "English example sentence", "translate": "Thai translation"},
    {"original": "...", "translate": "..."}
  ]
}
Give 2-3 examples.`

  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await aiGenerate('analysis', prompt, { temperature: 0.3, num_ctx: 8192 })
      const parsed = JSON.parse(extractJSON(raw)) as Record<string, unknown>
      const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
      if (!name) throw new Error('Model returned no grammar name')
      return {
        name,
        pattern: typeof parsed.pattern === 'string' ? parsed.pattern.trim() : '',
        explanation_th: typeof parsed.explanation_th === 'string' ? parsed.explanation_th.trim() : '',
        examples: Array.isArray(parsed.examples)
          ? (parsed.examples as { original?: string; translate?: string }[])
              .filter((ex) => ex && typeof ex.original === 'string')
              .map((ex) => ({ original: ex.original!.trim(), translate: (ex.translate || '').trim() }))
          : []
      }
    } catch (error) {
      lastError = error
      log.warn(`Grammar normalize attempt ${attempt} failed:`, error)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to process the grammar notes')
}

/** One speaking challenge that forces the learner to use the target grammar. */
export async function generateGrammarQuestion(grammar: GrammarInfo, avoid: string[]): Promise<GrammarQuestion> {
  const prompt = `You coach a Thai learner of English to actively USE this grammar in speech:

${grammarContext(grammar)}

Create ONE short situation or question (under 25 words, conversational) that the learner must answer by speaking 1-2 English sentences USING this grammar.
${avoid.length > 0 ? `Do not repeat these previous challenges:\n${avoid.slice(0, 8).map((a) => `- ${a}`).join('\n')}` : ''}
question_th is a natural Thai translation.

Return ONLY strict JSON, no markdown:
{"question_en": "...", "question_th": "..."}`

  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await aiGenerate('analysis', prompt, { temperature: 0.7, num_ctx: 8192 })
      const parsed = JSON.parse(extractJSON(raw)) as Record<string, unknown>
      const questionEn = typeof parsed.question_en === 'string' ? parsed.question_en.trim() : ''
      if (!questionEn) throw new Error('Model returned no question')
      return {
        question_en: questionEn,
        question_th: typeof parsed.question_th === 'string' ? parsed.question_th.trim() : ''
      }
    } catch (error) {
      lastError = error
      log.warn(`Grammar question attempt ${attempt} failed:`, error)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to generate a grammar challenge')
}

/** Grade a spoken answer against the target grammar — same shape as Speaking Q&A. */
export async function evaluateGrammarAnswer(data: {
  grammar: GrammarInfo
  question: string
  transcript: string
}): Promise<GrammarEvaluation> {
  const prompt = `You are an English grammar coach for a Thai learner. The learner answered a challenge by voice; the transcript below comes from speech-to-text (do not penalize punctuation or capitalization).

${grammarContext(data.grammar)}

Challenge: ${data.question}
Learner's spoken answer: ${data.transcript}

Evaluate:
- used_target: did the answer actually use the target grammar above?
- grammar_ok: is the sentence grammatically correct with natural word order?
- score: 0-100 (target grammar usage 40%, overall grammar 40%, naturalness 20%).
- feedback_th: 1-3 Thai sentences explaining what was right/wrong, especially about the target grammar.
- corrected_sentence: the learner's answer fixed (English). If already correct, repeat it.
- suggested_answer: one natural answer a fluent speaker might say that uses the target grammar (English).

Return ONLY strict JSON, no markdown:
{
  "score": 0,
  "grammar_ok": true,
  "used_target": true,
  "feedback_th": "...",
  "corrected_sentence": "...",
  "suggested_answer": "..."
}`

  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await aiGenerate('analysis', prompt, { temperature: 0.2, num_ctx: 8192 })
      const parsed = JSON.parse(extractJSON(raw)) as Record<string, unknown>
      return {
        score: clampScore(parsed.score),
        grammar_ok: Boolean(parsed.grammar_ok),
        used_target: Boolean(parsed.used_target),
        feedback_th: typeof parsed.feedback_th === 'string' ? parsed.feedback_th : '',
        corrected_sentence: typeof parsed.corrected_sentence === 'string' ? parsed.corrected_sentence : '',
        suggested_answer: typeof parsed.suggested_answer === 'string' ? parsed.suggested_answer : ''
      }
    } catch (error) {
      lastError = error
      log.warn(`Grammar evaluation attempt ${attempt} failed:`, error)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to evaluate the answer')
}
