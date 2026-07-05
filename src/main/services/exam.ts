import log from 'electron-log'
import { getSetting } from './database'
import { ollamaGenerate } from './ollama'
import { GeneratedExam, parseGeneratedExam } from './examUtils'

export async function generateExamQuiz(data: {
  sessionTitle: string
  segments: { position: number; original: string; translate: string }[]
  questionCount?: number
}): Promise<{ exam: GeneratedExam; model: string }> {
  const model = getSetting('analysis_model') || 'qwen3.6:27b'
  const questionCount = Math.max(5, Math.min(10, data.questionCount ?? 7))
  const transcript = data.segments
    .map((segment) => `${segment.position + 1}. ${segment.original}${segment.translate ? `\nThai: ${segment.translate}` : ''}`)
    .join('\n')
    .slice(0, 24000)

  const prompt = `You create short comprehension exams for an English shadowing application.

Session title: ${data.sessionTitle}
Transcript:
${transcript}

Create exactly ${questionCount} multiple-choice questions about the meaning, facts, sequence, main idea, and speaker intent in the clip.
- Questions and options must be in English.
- Every question must have exactly 4 plausible options.
- correctIndex is zero-based (0-3).
- explanation should be a concise Thai explanation of why the answer is correct.
- tag is a short category such as Main Idea, Detail, Sequence, Vocabulary, or Speaker Intent.
- Do not ask about information outside the transcript.

Return ONLY strict JSON with this shape, without markdown or commentary:
{
  "title": "...",
  "tags": ["Comprehension", "..."],
  "questions": [
    {
      "id": "q1",
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "explanation": "...",
      "tag": "Main Idea"
    }
  ]
}`

  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await ollamaGenerate(model, prompt, { temperature: 0.2, num_ctx: 16384 })
      return { exam: parseGeneratedExam(raw), model }
    } catch (error) {
      lastError = error
      log.warn(`Exam generation attempt ${attempt} failed:`, error)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to generate exam')
}
