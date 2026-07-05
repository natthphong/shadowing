import { spawn } from 'child_process'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import log from 'electron-log'
import { getSetting, getTtsCacheDir } from './database'
import { resolveRoute } from './aiProvider'
import { geminiTts } from './gemini'
import { PYTHON3_PATH, CHILD_ENV } from './paths'

function getTtsScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tts_generate.py')
  }
  // Dev: compiled to out/main/index.js → app root is two levels up
  return path.join(__dirname, '../../resources/tts_generate.py')
}

function textToCachePath(text: string, suffix = ''): string {
  const hash = crypto.createHash('md5').update(text.trim().toLowerCase()).digest('hex')
  return path.join(getTtsCacheDir(), `${hash}${suffix}.wav`)
}

export async function generateTts(
  text: string,
  voice = 'tara'
): Promise<string> {
  const route = resolveRoute('tts', getSetting)

  // Gemini voice — cached separately from the local voice so switching
  // providers doesn't replay audio from the other engine
  if (route.provider === 'gemini') {
    const geminiCachePath = textToCachePath(text, '_gemini')
    if (fs.existsSync(geminiCachePath) && fs.statSync(geminiCachePath).size > 0) {
      log.info('TTS cache hit (gemini):', geminiCachePath)
      return geminiCachePath
    }
    try {
      const wav = await geminiTts(route.model, text, getSetting('gemini_tts_voice') || 'Kore')
      fs.writeFileSync(geminiCachePath, wav)
      log.info('TTS done (gemini):', geminiCachePath)
      return geminiCachePath
    } catch (err) {
      log.warn('Gemini TTS failed, falling back to local voice:', err)
    }
  }

  const cachePath = textToCachePath(text)

  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
    log.info('TTS cache hit:', cachePath)
    return cachePath
  }

  const scriptPath = getTtsScriptPath()
  log.info('TTS generate:', text.slice(0, 60))

  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON3_PATH, [scriptPath, text, cachePath, voice], {
      env: CHILD_ENV
    })

    let stdout = ''
    proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    proc.stderr.on('data', (d: Buffer) => log.info('TTS:', d.toString().trim()))

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout.trim()) as { success: boolean; path: string; error?: string }
          if (result.success && result.path) {
            log.info('TTS done:', result.path, 'method:', (result as Record<string, unknown>).method)
            resolve(result.path)
          } else {
            reject(new Error(result.error || 'TTS failed'))
          }
        } catch {
          reject(new Error(`TTS parse error: ${stdout.slice(0, 200)}`))
        }
      } else {
        reject(new Error(`TTS script exited ${code}: ${stdout.slice(0, 200)}`))
      }
    })

    proc.on('error', (e) => reject(new Error(`Cannot run TTS: ${e.message}`)))
  })
}
