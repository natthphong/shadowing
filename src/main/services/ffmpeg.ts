import { spawn } from 'child_process'
import path from 'path'
import log from 'electron-log'
import { FFMPEG_PATH, FFPROBE_PATH, CHILD_ENV } from './paths'

export async function extractAudio(
  inputPath: string,
  outputDir: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const outPath = path.join(outputDir, `audio_${Date.now()}.wav`)
  log.info('Extracting audio from', inputPath, '→', outPath)

  return new Promise((resolve, reject) => {
    onProgress?.('Extracting audio...')

    const proc = spawn(FFMPEG_PATH, [
      '-i', inputPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-y',
      outPath
    ], { env: CHILD_ENV })

    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => {
      const msg = d.toString()
      stderr += msg
      const match = msg.match(/time=(\d+:\d+:\d+)/)
      if (match) onProgress?.(`Extracting audio: ${match[1]}`)
    })

    proc.on('close', (code) => {
      if (code === 0) {
        log.info('Audio extracted:', outPath)
        resolve(outPath)
      } else {
        reject(new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-400)}`))
      }
    })

    proc.on('error', (e) => reject(new Error(`Cannot run ffmpeg (${FFMPEG_PATH}): ${e.message}`)))
  })
}

export async function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(FFPROBE_PATH, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath
    ], { env: CHILD_ENV })

    let out = ''
    proc.stdout.on('data', (d: Buffer) => (out += d.toString()))
    proc.on('close', () => {
      try {
        const data = JSON.parse(out) as { format: { duration: string } }
        resolve(parseFloat(data.format.duration))
      } catch {
        resolve(0)
      }
    })
    proc.on('error', () => resolve(0))
  })
}
