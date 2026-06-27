export interface ScoreResult {
  accuracy_score: number
  pronunciation_score: number
  rhythm_score: number
  speed_score: number
  overall_score: number
  missing_words: string[]
  incorrect_words: string[]
  extra_words: string[]
  feedback_text: string
}

export function scoreAttempt(
  original: string,
  userTranscript: string,
  targetDuration: number,
  actualDuration: number
): ScoreResult {
  const origWords = tokenize(original)
  const userWords = tokenize(userTranscript)

  const { matched, missing, incorrect, extra } = compareWords(origWords, userWords)

  const accuracy = origWords.length > 0
    ? Math.round((matched / origWords.length) * 100)
    : 0

  const speedRatio = targetDuration > 0 ? actualDuration / targetDuration : 1
  const speed = Math.round(Math.max(0, 100 - Math.abs(speedRatio - 1) * 100))

  // Rough pronunciation score from accuracy + penalize incorrect
  const pronunciation = Math.round(
    Math.max(0, accuracy - incorrect.length * 5)
  )

  // Rhythm: penalize if too fast or too slow
  const rhythm = Math.round(
    Math.max(0, 100 - Math.abs(speedRatio - 1) * 80 - missing.length * 3)
  )

  const overall = Math.round((accuracy * 0.4 + pronunciation * 0.25 + rhythm * 0.2 + speed * 0.15))

  const parts: string[] = []
  if (missing.length > 0) parts.push(`Missing words: ${missing.join(', ')}`)
  if (incorrect.length > 0) parts.push(`Check pronunciation: ${incorrect.join(', ')}`)
  if (extra.length > 0) parts.push(`Extra words: ${extra.join(', ')}`)
  if (overall >= 90) parts.push('Excellent!')
  else if (overall >= 75) parts.push('Good job! Keep practicing.')
  else if (overall >= 60) parts.push('Keep going, you can improve!')
  else parts.push('Try again — listen carefully to the original.')

  return {
    accuracy_score: accuracy,
    pronunciation_score: pronunciation,
    rhythm_score: rhythm,
    speed_score: speed,
    overall_score: overall,
    missing_words: missing,
    incorrect_words: incorrect,
    extra_words: extra,
    feedback_text: parts.join(' ')
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
}

function compareWords(
  orig: string[],
  user: string[]
): { matched: number; missing: string[]; incorrect: string[]; extra: string[] } {
  const origSet = new Set(orig)
  const userSet = new Set(user)

  const matched = orig.filter((w) => userSet.has(w) || isSimilar(w, user)).length
  const missing = orig.filter((w) => !userSet.has(w) && !isSimilar(w, user))
  const incorrect = user.filter((w) => !origSet.has(w) && orig.some((o) => editDistance(o, w) <= 2 && editDistance(o, w) > 0))
  const extra = user.filter((w) => !origSet.has(w) && !incorrect.includes(w))

  return { matched, missing, incorrect, extra }
}

function isSimilar(word: string, candidates: string[]): boolean {
  return candidates.some((c) => editDistance(word, c) <= 1)
}

function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}
