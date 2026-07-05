import log from 'electron-log'
import { getSetting } from './database'

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
