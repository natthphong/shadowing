import log from 'electron-log'
import { extractJSON } from './ollama'
import { aiGenerate, routeFor } from './ai'

export interface GeneratedSpeakingQuestion {
  question_en: string
  question_th: string
}

export interface SpeakingEvaluation {
  score: number
  grammar_ok: boolean
  feedback_th: string
  corrected_sentence: string
  suggested_answer: string
}

function clampScore(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

export async function generateSpeakingQuestions(data: {
  sessionTitle: string
  segments: { position: number; original: string }[]
  questionCount: number
}): Promise<{ questions: GeneratedSpeakingQuestion[]; model: string }> {
  const { model } = routeFor('analysis')
  const count = Math.max(3, Math.min(15, data.questionCount))
  const transcript = data.segments
    .map((segment) => `${segment.position + 1}. ${segment.original}`)
    .join('\n')
    .slice(0, 20000)

  const prompt = `You create speaking-practice questions for a Thai learner of English who just studied this clip.

Session title: ${data.sessionTitle}
Transcript:
${transcript}

Create exactly ${count} short open-ended questions IN ENGLISH that the learner should answer by speaking 1-3 sentences.
- Mix question types: about the content of the clip, the learner's opinion of it, and how the topic relates to the learner's own life.
- Questions must be answerable without seeing the transcript again.
- Keep each question under 20 words, conversational tone.
- question_th is a natural Thai translation of the question.

Return ONLY strict JSON, no markdown, no commentary:
[
  {"question_en": "...", "question_th": "..."}
]`

  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await aiGenerate('analysis', prompt, { temperature: 0.4, num_ctx: 16384 })
      const parsed = JSON.parse(extractJSON(raw)) as GeneratedSpeakingQuestion[]
      const questions = parsed
        .filter((q) => q && typeof q.question_en === 'string' && q.question_en.trim().length > 0)
        .slice(0, count)
        .map((q) => ({
          question_en: q.question_en.trim(),
          question_th: typeof q.question_th === 'string' ? q.question_th.trim() : ''
        }))
      if (questions.length === 0) throw new Error('Model returned no questions')
      return { questions, model }
    } catch (error) {
      lastError = error
      log.warn(`Speaking question generation attempt ${attempt} failed:`, error)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to generate speaking questions')
}

export async function evaluateSpeakingAnswer(data: {
  question: string
  transcript: string
}): Promise<{ evaluation: SpeakingEvaluation; model: string }> {
  const { model } = routeFor('analysis')
  const prompt = `You are an English speaking coach for a Thai learner. The learner heard a question and answered by voice; the answer below is a speech-to-text transcript (punctuation may be missing — do not penalize punctuation or capitalization).

Question: ${data.question}
Learner's spoken answer: ${data.transcript}

Evaluate the answer:
- Is the sentence grammatically correct and in natural English word order?
- Does it actually answer the question?
- score: 0-100 overall (grammar 50%, relevance 30%, naturalness 20%).
- feedback_th: 1-3 sentences in Thai explaining what was wrong or good (grammar, word order, word choice).
- corrected_sentence: the learner's own answer with grammar fixed (English). If already correct, repeat it.
- suggested_answer: one natural example answer a fluent speaker might say (English, 1-2 sentences).

Return ONLY strict JSON, no markdown:
{
  "score": 0,
  "grammar_ok": true,
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
        evaluation: {
          score: clampScore(parsed.score),
          grammar_ok: Boolean(parsed.grammar_ok),
          feedback_th: typeof parsed.feedback_th === 'string' ? parsed.feedback_th : '',
          corrected_sentence: typeof parsed.corrected_sentence === 'string' ? parsed.corrected_sentence : '',
          suggested_answer: typeof parsed.suggested_answer === 'string' ? parsed.suggested_answer : ''
        },
        model
      }
    } catch (error) {
      lastError = error
      log.warn(`Speaking answer evaluation attempt ${attempt} failed:`, error)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to evaluate the answer')
}
