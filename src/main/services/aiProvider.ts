// Pure provider-routing and Gemini request/response helpers.
// No electron imports — unit-testable in isolation.

export type AiRole = 'analysis' | 'translate' | 'tts'
export type AiProvider = 'local' | 'gemini'

export interface AiRoute {
  provider: AiProvider
  model: string
}

export type SettingReader = (key: string) => string | null

export const GEMINI_DEFAULTS = {
  analysis: 'gemini-3.1-flash-lite',
  translate: 'gemini-3.1-flash-lite',
  tts: 'gemini-3.1-flash-tts-preview'
} as const

const PROVIDER_KEYS: Record<AiRole, string> = {
  analysis: 'analysis_provider',
  translate: 'translate_provider',
  tts: 'tts_provider'
}

const GEMINI_MODEL_KEYS: Record<AiRole, string> = {
  analysis: 'gemini_analysis_model',
  translate: 'gemini_translate_model',
  tts: 'gemini_tts_model'
}

const LOCAL_MODEL_KEYS: Record<AiRole, { key: string; fallback: string }> = {
  analysis: { key: 'analysis_model', fallback: 'qwen3.6:27b' },
  translate: { key: 'interactive_translate_model', fallback: 'scb10x/typhoon-translate1.5-4b' },
  tts: { key: 'tts_model', fallback: 'legraphista/Orpheus:latest' }
}

/**
 * Decide which provider serves a role. Gemini is used only when the role's
 * provider setting is 'gemini' AND an API key is configured — otherwise the
 * local (Ollama / python) path is used, so the app keeps working offline.
 */
export function resolveRoute(role: AiRole, get: SettingReader): AiRoute {
  const provider = (get(PROVIDER_KEYS[role]) || 'local').trim()
  const apiKey = (get('gemini_api_key') || '').trim()

  if (provider === 'gemini' && apiKey) {
    const model = (get(GEMINI_MODEL_KEYS[role]) || '').trim() || GEMINI_DEFAULTS[role]
    return { provider: 'gemini', model }
  }

  const local = LOCAL_MODEL_KEYS[role]
  return { provider: 'local', model: (get(local.key) || '').trim() || local.fallback }
}

// ── Gemini generateContent request/response ──────────────────────────────────

export interface ChatMessage {
  role: string
  content: string
}

export function buildGeminiGenerateBody(
  prompt: string,
  options?: { temperature?: number }
): Record<string, unknown> {
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: options?.temperature ?? 0.3 }
  }
}

export function buildGeminiChatBody(
  messages: ChatMessage[],
  options?: { temperature?: number }
): Record<string, unknown> {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: options?.temperature ?? 0.3 }
  }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  return body
}

export function buildGeminiTtsBody(text: string, voice = 'Kore'): Record<string, unknown> {
  return {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
    }
  }
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[] }
  }[]
  error?: { message?: string }
}

export function parseGeminiText(json: unknown): string {
  const data = json as GeminiResponse
  if (data.error?.message) throw new Error(`Gemini error: ${data.error.message}`)
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || '')
    .join('')
    .trim()
  if (!text) throw new Error('Gemini returned no text')
  return text
}

export function parseGeminiAudio(json: unknown): { base64: string; mimeType: string } {
  const data = json as GeminiResponse
  if (data.error?.message) throw new Error(`Gemini error: ${data.error.message}`)
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
  if (!part?.inlineData?.data) throw new Error('Gemini returned no audio')
  return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType || 'audio/pcm' }
}

export function sampleRateFromMime(mimeType: string): number {
  const match = /rate=(\d+)/.exec(mimeType)
  return match ? parseInt(match[1], 10) : 24000
}

/** Wrap raw 16-bit mono PCM in a WAV (RIFF) container. */
export function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const channels = 1
  const bitsPerSample = 16
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM format
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
