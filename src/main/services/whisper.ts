import { spawn } from 'child_process'
import path from 'path'
import { app } from 'electron'
import log from 'electron-log'
import { getSetting } from './database'
import { PYTHON3_PATH, CHILD_ENV } from './paths'

export interface WordTimestamp {
  word: string
  start: number
  end: number
}

export interface WhisperSegment {
  id: number
  start: number
  end: number
  text: string
  words?: WordTimestamp[]
}

export interface WhisperResult {
  text: string
  segments: WhisperSegment[]
  language: string
}

export function getScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'whisper_transcribe.py')
  }
  // Dev: relative to compiled main/services/whisper.js → ../../resources/
  return path.join(__dirname, '../../resources/whisper_transcribe.py')
}

export async function transcribeAudio(
  audioPath: string,
  onProgress?: (msg: string) => void
): Promise<WhisperResult> {
  const model = getSetting('whisper_model') || 'mlx-community/whisper-large-v3-turbo'
  const scriptPath = getScriptPath()

  log.info('Whisper script path:', scriptPath)
  log.info('Audio path:', audioPath)
  log.info('Model:', model)

  return new Promise((resolve, reject) => {
    onProgress?.('Starting Whisper transcription...')

    const proc = spawn(PYTHON3_PATH, [scriptPath, audioPath, model], {
      env: CHILD_ENV
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })

    proc.stderr.on('data', (d: Buffer) => {
      const msg = d.toString().trim()
      if (msg) {
        log.info('Whisper:', msg)
        onProgress?.(msg.slice(0, 120))
      }
      stderr += msg
    })

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout) as WhisperResult
          resolve(result)
        } catch (e) {
          reject(new Error(`Failed to parse Whisper output: ${e}\nRaw: ${stdout.slice(0, 300)}`))
        }
      } else {
        reject(new Error(`Whisper failed (code ${code}): ${stderr.slice(-500)}`))
      }
    })

    proc.on('error', (e) => {
      reject(new Error(`Cannot run python3 (${PYTHON3_PATH}): ${e.message}`))
    })
  })
}

export function segmentizeTranscript(result: WhisperResult): WhisperSegment[] {
  const MAX_CHARS = 120
  const MAX_DURATION = 10

  // If Whisper already produced short segments, use them directly
  const shortEnough = result.segments.every(
    (s) => s.text.trim().length <= MAX_CHARS && s.end - s.start <= MAX_DURATION
  )
  if (shortEnough && result.segments.length > 0) {
    return result.segments.map((s, i) => ({ ...s, id: i, text: s.text.trim() }))
  }

  const segments: WhisperSegment[] = []
  let buffer = ''
  let bufStart = 0
  let bufEnd = 0
  let wordBuf: WordTimestamp[] = []
  let segId = 0

  function flush(): void {
    const text = buffer.trim()
    if (!text) return
    segments.push({ id: segId++, start: bufStart, end: bufEnd, text, words: wordBuf.slice() })
    buffer = ''
    wordBuf = []
  }

  for (const seg of result.segments) {
    // Split on sentence boundaries
    const sentences = seg.text.split(/(?<=[.!?])\s+/)
    for (const sent of sentences) {
      const trimmed = sent.trim()
      if (!trimmed) continue

      const wouldBeLen = buffer.length + (buffer ? ' ' : '') + trimmed.length
      const wouldBeDur = seg.end - bufStart

      if (buffer && (wouldBeLen > MAX_CHARS || wouldBeDur > MAX_DURATION)) {
        flush()
        bufStart = seg.start
      }

      if (!buffer) bufStart = seg.start
      buffer = buffer ? `${buffer} ${trimmed}` : trimmed
      bufEnd = seg.end
      if (seg.words) wordBuf.push(...seg.words)
    }
  }

  flush()
  return segments
}
