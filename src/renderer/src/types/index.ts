export interface Source {
  id: string
  type: 'youtube' | 'mp4' | 'mp3' | 'audio' | 'video' | 'transcript'
  title: string
  url?: string
  local_media_path?: string
  thumbnail?: string
  duration_seconds?: number
  created_at: string
}

export interface Session {
  id: string
  source_id: string
  title: string
  created_at: string
  completed_at?: string
  completion_percentage: number
  practice_duration_seconds: number
  total_segments: number
  source_type?: string
  url?: string
  thumbnail?: string
  local_media_path?: string
  exam_attempt_count?: number
  has_exam?: number | boolean
}

export interface WordTimestamp {
  word: string
  start: number
  end: number
}

export interface Segment {
  id: string
  session_id: string
  original: string
  translate: string
  start_time: number
  end_time: number
  duration: number
  word_timestamps?: string
  position: number
  transcription_model?: string
  translation_model?: string
}

export interface PracticeAttempt {
  id: string
  segment_id: string
  user_transcript: string
  audio_path?: string
  accuracy_score: number
  pronunciation_score: number
  rhythm_score: number
  speed_score: number
  overall_score: number
  feedback?: string
  created_at: string
}

export interface Flashcard {
  id: string
  type: 'vocabulary' | 'sentence_speaking' | 'pronunciation' | 'grammar'
  front: string
  back: string
  source_segment_id?: string
  session_id?: string
  difficulty: string
  interval_days: number
  ease_factor: number
  next_due_at?: string
  last_reviewed_at?: string
  review_count: number
  correct_count: number
}

export interface GrammarItem {
  id: string
  name: string
  pattern?: string
  explanation_th?: string
  examples: string
  last_seen_at?: string
  source_sessions: string
  review_count: number
}

export interface VocabularyItem {
  id: string
  word: string
  translate?: string
  source_session_id?: string
  reason?: string
  priority: string
  created_at: string
}

export interface DashboardStats {
  totalSessions: number
  totalSegments: number
  totalAttempts: number
  avgScore: number
  totalVocab: number
  totalGrammar: number
  dueFlashcards: number
  totalFlashcards: number
  recentSessions: (Session & { avg_score?: number })[]
  scoreByDay: { day: string; avg_score: number; count: number }[]
  topMissedWords: { word: string; c: number }[]
}

export interface ImportProgress {
  step: string
  detail: string
  pct: number
}

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

export interface ExamQuestion {
  id: string
  question: string
  options: string[]
  tag: string
}

export interface ExamQuiz {
  id: string
  session_id: string
  title: string
  tags: string[]
  model?: string
  created_at: string
  questions: ExamQuestion[]
}

export interface ExamAttemptSummary {
  id: string
  quiz_id: string
  session_id: string
  correct_count: number
  total_questions: number
  score: number
  completed_at: string
}

export interface ExamSessionData {
  quiz: ExamQuiz | null
  attempts: ExamAttemptSummary[]
}

export interface ExamReviewQuestion extends ExamQuestion {
  correctIndex: number
  explanation: string
  selectedIndex: number | null
  isCorrect: boolean
}

export interface ExamReview {
  attempt: ExamAttemptSummary
  quiz: Omit<ExamQuiz, 'questions'> & { questions: ExamReviewQuestion[] }
}

export interface ExamHistoryEntry extends ExamAttemptSummary {
  session_title: string
  quiz_title: string
  tags: string[]
}
