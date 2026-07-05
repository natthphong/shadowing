import log from 'electron-log'
import { getSetting, getCachedTranslation, setCachedTranslation } from './database'

function baseUrl(): string {
  return getSetting('ollama_base_url') || 'http://localhost:11434'
}

export async function ollamaGenerate(
  model: string,
  prompt: string,
  options?: { temperature?: number; num_ctx?: number }
): Promise<string> {
  const url = `${baseUrl()}/api/generate`
  const body = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: options?.temperature ?? 0.3,
      num_ctx: options?.num_ctx ?? 4096
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) throw new Error(`Ollama error: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { response: string }
  return data.response.trim()
}

export async function ollamaChat(
  model: string,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; num_ctx?: number }
): Promise<string> {
  const url = `${baseUrl()}/api/chat`
  const body = {
    model,
    messages,
    stream: false,
    options: {
      temperature: options?.temperature ?? 0.3,
      num_ctx: options?.num_ctx ?? 8192
    },
    think: false
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) throw new Error(`Ollama chat error: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { message: { content: string } }
  return data.message.content.trim()
}

export async function ollamaEmbed(texts: string[]): Promise<number[][]> {
  const model = getSetting('embedding_model') || 'bge-m3'
  const url = `${baseUrl()}/api/embed`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts })
  })

  if (!res.ok) throw new Error(`Embed error: ${res.status}`)
  const data = (await res.json()) as { embeddings: number[][] }
  return data.embeddings
}

export async function listModels(): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl()}/api/tags`)
    if (!res.ok) return []
    const data = (await res.json()) as { models: { name: string }[] }
    return data.models.map((m) => m.name)
  } catch {
    return []
  }
}

async function translateOne(
  seg: { id: string; original: string },
  model: string
): Promise<{ id: string; original: string; translate: string }> {
  const prompt = `Translate to Thai. Reply with ONLY the Thai translation, no explanation, no markdown.\n\n${seg.original}\n\nThai:`
  try {
    const raw = await ollamaGenerate(model, prompt, { temperature: 0.1 })
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
  const model = getSetting('bulk_translate_model') || 'scb10x/typhoon-translate1.5-4b'
  const workerCount = Math.max(1, parseInt(getSetting('translate_workers') || '2', 10))

  // Split segments evenly across workers
  const chunkSize = Math.ceil(segments.length / workerCount)
  const chunks: typeof segments[] = []
  for (let i = 0; i < segments.length; i += chunkSize) {
    chunks.push(segments.slice(i, i + chunkSize))
  }

  log.info(`Translating ${segments.length} segments with ${chunks.length} workers, model: ${model}`)

  let done = 0
  const total = segments.length

  // Each worker processes its chunk sequentially; all workers run concurrently
  const chunkResults = await Promise.all(
    chunks.map(async (chunk, wi) => {
      const results: { id: string; original: string; translate: string }[] = []
      for (const seg of chunk) {
        const r = await translateOne(seg, model)
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

  const model = getSetting('interactive_translate_model') || 'scb10x/typhoon-translate1.5-4b'
  const prompt = `Translate this English text to Thai. Reply with ONLY the Thai translation, nothing else.\n\nText: ${text}\n\nThai:`
  const result = await ollamaGenerate(model, prompt, { temperature: 0.2 })
  const translation = result.replace(/^Thai:\s*/i, '').trim()

  setCachedTranslation(key, translation)
  return translation
}

export async function analyzeSession(data: {
  segments: { id: string; original: string; translate: string }[]
  attempts: {
    segment_id: string
    user_transcript: string
    overall_score: number
    accuracy_score: number
  }[]
}): Promise<Record<string, unknown>> {
  const model = getSetting('analysis_model') || 'qwen3.6:27b'
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
      const raw = await ollamaGenerate(model, prompt, { temperature: 0.2, num_ctx: 16384 })
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

export function extractJSON(text: string): string {
  // Remove <think>...</think> blocks from qwen models
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // Find first [ or {
  const start = Math.min(
    text.indexOf('[') === -1 ? Infinity : text.indexOf('['),
    text.indexOf('{') === -1 ? Infinity : text.indexOf('{')
  )
  if (start === Infinity) throw new Error('No JSON found')
  // Find matching closing bracket
  const openChar = text[start]
  const closeChar = openChar === '[' ? ']' : '}'
  let depth = 0
  let end = -1
  for (let i = start; i < text.length; i++) {
    if (text[i] === openChar) depth++
    else if (text[i] === closeChar) {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end === -1) throw new Error('Unmatched JSON')
  return text.slice(start, end + 1)
}
