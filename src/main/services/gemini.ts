import log from 'electron-log'
import { getSetting } from './database'
import {
  ChatMessage,
  buildGeminiChatBody,
  buildGeminiGenerateBody,
  buildGeminiTtsBody,
  parseGeminiAudio,
  parseGeminiText,
  pcmToWav,
  sampleRateFromMime
} from './aiProvider'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

async function callGemini(model: string, body: Record<string, unknown>): Promise<unknown> {
  const apiKey = (getSetting('gemini_api_key') || '').trim()
  if (!apiKey) throw new Error('Gemini API key is not configured')

  const res = await fetch(`${BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  })

  const json = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const message = (json as { error?: { message?: string } } | null)?.error?.message
    throw new Error(`Gemini HTTP ${res.status}: ${message || 'request failed'}`)
  }
  return json
}

export async function geminiGenerate(
  model: string,
  prompt: string,
  options?: { temperature?: number }
): Promise<string> {
  const json = await callGemini(model, buildGeminiGenerateBody(prompt, options))
  return parseGeminiText(json)
}

export async function geminiChat(
  model: string,
  messages: ChatMessage[],
  options?: { temperature?: number }
): Promise<string> {
  const json = await callGemini(model, buildGeminiChatBody(messages, options))
  return parseGeminiText(json)
}

/** Generate speech and return a WAV buffer (Gemini streams raw 16-bit PCM). */
export async function geminiTts(model: string, text: string, voice = 'Kore'): Promise<Buffer> {
  const json = await callGemini(model, buildGeminiTtsBody(text, voice))
  const { base64, mimeType } = parseGeminiAudio(json)
  const pcm = Buffer.from(base64, 'base64')
  if (/wav|x-wav/.test(mimeType)) return pcm
  const wav = pcmToWav(pcm, sampleRateFromMime(mimeType))
  log.info(`Gemini TTS: ${pcm.length} bytes PCM (${mimeType}) → wav`)
  return wav
}
