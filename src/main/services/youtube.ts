import { spawn } from 'child_process'
import path from 'path'
import log from 'electron-log'
import { YTDLP_PATH, FFMPEG_PATH, CHILD_ENV } from './paths'

export interface YtMetadata {
  id: string
  title: string
  thumbnail: string
  duration: number
  uploader: string
}

export async function fetchYtMetadata(url: string): Promise<YtMetadata> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, [
      '--dump-json',
      '--no-playlist',
      '--extractor-args', 'youtube:player_client=android,ios',
      url
    ], { env: CHILD_ENV })

    let out = ''
    let err = ''
    proc.stdout.on('data', (d: Buffer) => (out += d.toString()))
    proc.stderr.on('data', (d: Buffer) => (err += d.toString()))
    proc.on('close', (code) => {
      if (code === 0) {
        try { resolve(JSON.parse(out) as YtMetadata) }
        catch { reject(new Error('Invalid yt-dlp output')) }
      } else {
        reject(new Error(`yt-dlp failed: ${err.slice(-400)}`))
      }
    })
    proc.on('error', (e) => reject(new Error(`yt-dlp not found: ${e.message}`)))
  })
}

export async function downloadYtVideo(
  url: string,
  outputDir: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  // Download best video ≤480p (reasonable file size) merged into mp4
  const outTemplate = path.join(outputDir, 'yt_vid_%(id)s.%(ext)s')

  return new Promise((resolve, reject) => {
    onProgress?.('Downloading video from YouTube...')
    log.info('[yt-dlp video] Starting download:', url)

    const proc = spawn(YTDLP_PATH, [
      '-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--ffmpeg-location', FFMPEG_PATH,
      '--extractor-args', 'youtube:player_client=android,ios',
      '--no-playlist',
      '--no-mtime',
      '-o', outTemplate,
      '--print', 'after_move:filepath',
      url
    ], { env: CHILD_ENV })

    let lastLine = ''
    let err = ''

    proc.stdout.on('data', (d: Buffer) => {
      const line = d.toString().trim()
      if (line) { lastLine = line; log.info('[yt-dlp video] stdout:', line) }
    })
    proc.stderr.on('data', (d: Buffer) => {
      const msg = d.toString()
      err += msg
      const pct = msg.match(/(\d+\.?\d*)%/)
      if (pct) onProgress?.(`Downloading video: ${parseFloat(pct[1]).toFixed(0)}%`)
    })
    proc.on('close', (code) => {
      if (code === 0 && lastLine) resolve(lastLine.trim())
      else if (code === 0) reject(new Error('yt-dlp video: no output path received'))
      else reject(new Error(`yt-dlp video failed (code ${code}): ${err.slice(-400)}`))
    })
    proc.on('error', (e) => reject(new Error(`Cannot run yt-dlp: ${e.message}`)))
  })
}

export async function downloadYtAudio(
  url: string,
  outputDir: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const outTemplate = path.join(outputDir, 'yt_%(id)s.%(ext)s')

  return new Promise((resolve, reject) => {
    onProgress?.('Downloading audio from YouTube...')
    log.info('Starting yt-dlp download:', url)

    const proc = spawn(YTDLP_PATH, [
      '-x',
      '--audio-format', 'wav',
      '--audio-quality', '0',
      '--postprocessor-args', `ffmpeg:-ar 16000 -ac 1`,
      '--ffmpeg-location', FFMPEG_PATH,
      '--extractor-args', 'youtube:player_client=android,ios',
      '--no-playlist',
      '-o', outTemplate,
      '--print', 'after_move:filepath',
      '--no-mtime',
      url
    ], { env: CHILD_ENV })

    let lastLine = ''
    let err = ''

    proc.stdout.on('data', (d: Buffer) => {
      const line = d.toString().trim()
      if (line) {
        lastLine = line
        log.info('yt-dlp stdout:', line)
      }
    })

    proc.stderr.on('data', (d: Buffer) => {
      const msg = d.toString()
      err += msg
      const pct = msg.match(/(\d+\.\d+)%/)
      if (pct) onProgress?.(`Downloading: ${pct[1]}%`)
      const speed = msg.match(/at\s+([\d.]+\w+\/s)/)
      if (speed) onProgress?.(`Downloading... ${speed[1]}`)
    })

    proc.on('close', (code) => {
      log.info('yt-dlp exit code:', code, 'lastLine:', lastLine)
      if (code === 0 && lastLine) {
        resolve(lastLine)
      } else if (code === 0) {
        reject(new Error('yt-dlp finished but no output file path received'))
      } else {
        reject(new Error(`yt-dlp failed (code ${code}): ${err.slice(-600)}`))
      }
    })

    proc.on('error', (e) => reject(new Error(`Cannot run yt-dlp (${YTDLP_PATH}): ${e.message}`)))
  })
}
