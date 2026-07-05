// Provider-aware AI entry points. Analysis / translate calls go through
// aiGenerate/aiChat which route to local Ollama or Gemini based on Settings.
import log from 'electron-log'
import { getSetting, getCachedTranslation, setCachedTranslation } from './database'
import { ollamaGenerate, ollamaChat, extractJSON } from './ollama'
import { geminiGenerate, geminiChat } from './gemini'
import { AiRole, ChatMessage, resolveRoute } from './aiProvider'

export function routeFor(role: AiRole): { provider: string; model: string } {
  return resolveRoute(role, getSetting)
}

export async function aiGenerate(
  role: 'analysis' | 'translate',
  prompt: string,
  options?: { temperature?: number; num_ctx?: number }
): Promise<string> {
  const route = resolveRoute(role, getSetting)
  if (route.provider === 'gemini') {
    return geminiGenerate(route.model, prompt, { temperature: options?.temperature })
  }
  return ollamaGenerate(route.model, prompt, options)
}

export async function aiChat(
  role: 'analysis' | 'translate',
  messages: ChatMessage[],
  options?: { temperature?: number; num_ctx?: number }
): Promise<string> {
  const route = resolveRoute(role, getSetting)
  if (route.provider === 'gemini') {
    return geminiChat(route.model, messages, { temperature: options?.temperature })
  }
  return ollamaChat(route.model, messages, options)
}

// ── Translation ───────────────────────────────────────────────────────────────

async function translateOne(seg: {
  id: string
  original: string
}): Promise<{ id: string; original: string; translate: string }> {
  const prompt = `Translate to Thai. Reply with ONLY the Thai translation, no explanation, no markdown.\n\n${seg.original}\n\nThai:`
  try {
    const raw = await aiGenerate('translate', prompt, { temperature: 0.1 })
    const translation = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^Thai:\s*/i, '').trim()
    return { ...seg, translate: translation }
  } catch (e) {
    log.warn(`Segment translate failed (${seg.id}):`, e)
    return { ...seg, translate: '' }
  }
}

export async function bulkTranslateSegments(
  segments: { id: string; original: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<{ id: string; original: string; translate: string }[]> {
  const route = resolveRoute('translate', getSetting)
  const workerCount = Math.max(1, parseInt(getSetting('translate_workers') || '2', 10))

  // Split segments evenly across workers
  const chunkSize = Math.ceil(segments.length / workerCount)
  const chunks: typeof segments[] = []
  for (let i = 0; i < segments.length; i += chunkSize) {
    chunks.push(segments.slice(i, i + chunkSize))
  }

  log.info(`Translating ${segments.length} segments with ${chunks.length} workers via ${route.provider} (${route.model})`)

  let done = 0
  const total = segments.length

  // Each worker processes its chunk sequentially; all workers run concurrently
  const chunkResults = await Promise.all(
    chunks.map(async (chunk, wi) => {
      const results: { id: string; original: string; translate: string }[] = []
      for (const seg of chunk) {
        const r = await translateOne(seg)
        results.push(r)
        done++
        log.info(`Worker ${wi + 1}: translated ${done}/${total} — "${r.translate.slice(0, 30)}"`)
        onProgress?.(done, total)
      }
      return results
    })
  )

  return chunkResults.flat()
}

export async function interactiveTranslate(text: string): Promise<string> {
  const key = text.trim().toLowerCase()
  const cached = getCachedTranslation(key)
  if (cached) {
    log.info('Translation cache hit:', key.slice(0, 40))
    return cached
  }

  const prompt = `Translate this English text to Thai. Reply with ONLY the Thai translation, nothing else.\n\nText: ${text}\n\nThai:`
  const result = await aiGenerate('translate', prompt, { temperature: 0.2 })
  const translation = result.replace(/^Thai:\s*/i, '').trim()

  setCachedTranslation(key, translation)
  return translation
}

// ── Post-session analysis ─────────────────────────────────────────────────────

export async function analyzeSession(data: {
  segments: { id: string; original: string; translate: string }[]
  attempts: {
    segment_id: string
    user_transcript: string
    overall_score: number
    accuracy_score: number
  }[]
}): Promise<Record<string, unknown>> {
  const prompt = `You are an English language coach analyzing a student's shadowing practice session.

Session data:
${JSON.stringify(data, null, 2)}

Analyze the session and return ONLY valid JSON with this structure (no markdown, no thinking):
{
  "summary": {
    "overall_feedback": "...",
    "main_weaknesses": ["...", "..."]
  },
  "sentences_to_review": [
    {"sentence_id": "...", "original": "...", "translate": "...", "reason": "...", "priority": "high|medium|low"}
  ],
  "words_to_practice": [
    {"word": "...", "translate": "...", "reason": "...", "priority": "high|medium|low"}
  ],
  "grammar_items": [
    {"name": "...", "pattern": "...", "explanation_th": "...", "examples": [{"original": "...", "translate": "..."}]}
  ]
}`

  let attempt = 0
  while (attempt < 3) {
    try {
      const raw = await aiGenerate('analysis', prompt, { temperature: 0.2, num_ctx: 16384 })
      const jsonStr = extractJSON(raw)
      return JSON.parse(jsonStr)
    } catch (e) {
      log.warn(`Analysis attempt ${attempt + 1} failed:`, e)
      attempt++
    }
  }

  return {
    summary: { overall_feedback: 'Analysis not available', main_weaknesses: [] },
    sentences_to_review: [],
    words_to_practice: [],
    grammar_items: []
  }
}
