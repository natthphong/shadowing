export interface ExamQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number
  explanation: string
  tag: string
}

export interface GeneratedExam {
  title: string
  tags: string[]
  questions: ExamQuestion[]
}

function extractJSONObject(text: string): string {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const start = cleaned.indexOf('{')
  if (start < 0) throw new Error('Quiz response did not contain JSON')

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return cleaned.slice(start, index + 1)
    }
  }
  throw new Error('Quiz JSON was incomplete')
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseGeneratedExam(raw: string): GeneratedExam {
  const parsed = JSON.parse(extractJSONObject(raw)) as Record<string, unknown>
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : []

  const questions = rawQuestions.flatMap((entry, index): ExamQuestion[] => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const question = cleanText(item.question)
    const options = Array.isArray(item.options) ? item.options.map(cleanText) : []
    const correctIndex = Number(item.correctIndex)
    if (
      !question ||
      options.length !== 4 ||
      options.some((option) => !option) ||
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex > 3
    ) return []

    return [{
      id: cleanText(item.id) || `q${index + 1}`,
      question,
      options,
      correctIndex,
      explanation: cleanText(item.explanation) || 'Review the source transcript for this answer.',
      tag: cleanText(item.tag) || 'Comprehension'
    }]
  }).slice(0, 10)

  if (questions.length < 5) {
    throw new Error(`Quiz must contain at least 5 valid questions; received ${questions.length}`)
  }

  const suppliedTags = Array.isArray(parsed.tags) ? parsed.tags.map(cleanText).filter(Boolean) : []
  const tags = Array.from(new Set([...suppliedTags, ...questions.map((question) => question.tag)])).slice(0, 6)

  return {
    title: cleanText(parsed.title) || 'Post-Session Comprehension Quiz',
    tags,
    questions
  }
}

export function gradeExam(
  questions: ExamQuestion[],
  answers: Array<number | null>
): { correctCount: number; totalQuestions: number; score: number } {
  const correctCount = questions.reduce(
    (count, question, index) => count + (answers[index] === question.correctIndex ? 1 : 0),
    0
  )
  const totalQuestions = questions.length
  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0
  return { correctCount, totalQuestions, score }
}
