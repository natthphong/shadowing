import { describe, expect, it } from 'vitest'
import { gradeExam, parseGeneratedExam } from '../examUtils'

const questions = Array.from({ length: 5 }, (_, index) => ({
  id: `q${index + 1}`,
  question: `Question ${index + 1}?`,
  options: ['A', 'B', 'C', 'D'],
  correctIndex: index % 4,
  explanation: `คำอธิบาย ${index + 1}`,
  tag: index % 2 === 0 ? 'Detail' : 'Main Idea'
}))

describe('parseGeneratedExam', () => {
  it('parses valid JSON wrapped in model thinking and markdown', () => {
    const raw = `<think>hidden reasoning</think>\n\`\`\`json\n${JSON.stringify({
      title: 'Clip Quiz',
      tags: ['Comprehension'],
      questions
    })}\n\`\`\``

    const result = parseGeneratedExam(raw)

    expect(result.title).toBe('Clip Quiz')
    expect(result.questions).toHaveLength(5)
    expect(result.tags).toContain('Detail')
  })

  it('rejects responses with fewer than five valid questions', () => {
    expect(() => parseGeneratedExam(JSON.stringify({ questions: questions.slice(0, 4) })))
      .toThrow(/at least 5 valid questions/)
  })
})

describe('gradeExam', () => {
  it('grades answers using server-side correct indexes', () => {
    expect(gradeExam(questions, [0, 1, 2, null, 0])).toEqual({
      correctCount: 4,
      totalQuestions: 5,
      score: 80
    })
  })
})
