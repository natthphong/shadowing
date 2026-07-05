import { ipcMain, BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import os from 'os'
import log from 'electron-log'
import { getDb, getMediaDir } from '../services/database'
import { transcribeAudio, segmentizeTranscript, WhisperSegment } from '../services/whisper'
import { extractAudio, getMediaDuration } from '../services/ffmpeg'
import { fetchYtMetadata, downloadYtAudio } from '../services/youtube'
import { bulkTranslateSegments } from '../services/ai'
import { generateTts } from '../services/tts'
import { FFMPEG_PATH, CHILD_ENV } from '../services/paths'
import { spawn } from 'child_process'

function sendProgress(win: BrowserWindow | null, step: string, detail: string, pct: number): void {
  win?.webContents.send('import:progress', { step, detail, pct })
}

function saveSegments(
  sessionId: string,
  whisperSegs: WhisperSegment[],
  translations: Map<string, string>
): void {
  const db = getDb()
  const insert = db.prepare(`
    INSERT INTO segments (id, session_id, original, translate, start_time, end_time, duration, word_timestamps, transcription_model, translation_model, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const tx = db.transaction(() => {
    for (let i = 0; i < whisperSegs.length; i++) {
      const seg = whisperSegs[i]
      const id = `seg_${uuidv4()}`
      insert.run(
        id,
        sessionId,
        seg.text.trim(),
        translations.get(String(seg.id)) || '',
        seg.start,
        seg.end,
        seg.end - seg.start,
        JSON.stringify(seg.words || []),
        'whisper-large-v3-turbo',
        'qwen3.5:9b',
        i
      )
    }
  })
  tx()
}

async function runTranslation(
  segs: WhisperSegment[],
  win: BrowserWindow | null,
  progressBase: number
): Promise<Map<string, string>> {
  const total = segs.length
  sendProgress(win, 'translating', `Translating 0/${total}...`, progressBase)
  const input = segs.map((s) => ({ id: String(s.id), original: s.text.trim() }))
  const results = await bulkTranslateSegments(input, (done, tot) => {
    const pct = progressBase + Math.round((done / tot) * 20)
    sendProgress(win, 'translating', `Translating ${done}/${tot}...`, pct)
  })
  const map = new Map<string, string>()
  for (const r of results) map.set(r.id, r.translate)
  return map
}

function mergeAudioFiles(inputPaths: string[], outputPath: string, _durations: number[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // Write a concat list file for ffmpeg
    const listPath = path.join(os.tmpdir(), `concat_${Date.now()}.txt`)
    const listContent = inputPaths.map((p) => `file '${p}'`).join('\n')
    fs.writeFileSync(listPath, listContent)

    const proc = spawn(FFMPEG_PATH, [
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-ar', '24000',
      '-ac', '1',
      '-y',
      outputPath
    ], { env: CHILD_ENV })

    proc.on('close', (code) => {
      fs.existsSync(listPath) && fs.unlinkSync(listPath)
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg concat failed (code ${code})`))
    })
    proc.on('error', (e) => reject(e))
  })
}

export function registerImportHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('import:youtube', async (_e, url: string) => {
    const win = getWindow()
    const db = getDb()
    const mediaDir = getMediaDir()

    try {
      sendProgress(win, 'metadata', 'Fetching YouTube metadata...', 5)
      const meta = await fetchYtMetadata(url)

      // Stream-first strategy: we only download audio for Whisper, then delete
      // it. Playback uses the YouTube embed (streamed), which keeps the media
      // folder and export zips small.
      sendProgress(win, 'download', 'Downloading audio for transcription...', 10)
      const whisperAudioPath = await downloadYtAudio(url, mediaDir, (msg) =>
        sendProgress(win, 'download', msg, 25)
      )

      sendProgress(win, 'transcribe', 'Transcribing with Whisper...', 38)
      const whisperResult = await transcribeAudio(whisperAudioPath, (msg) =>
        sendProgress(win, 'transcribe', msg, 43)
      )

      sendProgress(win, 'segment', 'Segmenting transcript...', 65)
      const segments = segmentizeTranscript(whisperResult)

      const translations = await runTranslation(segments, win, 70)

      sendProgress(win, 'saving', 'Saving session...', 90)

      // Transcription is done — the audio served its purpose
      try {
        if (fs.existsSync(whisperAudioPath)) fs.unlinkSync(whisperAudioPath)
      } catch (cleanupErr) {
        log.warn('Could not delete temp YouTube audio:', cleanupErr)
      }

      const sourceId = `src_${uuidv4()}`
      const sessionId = `ses_${uuidv4()}`

      db.prepare(
        'INSERT INTO sources (id, type, title, url, local_media_path, thumbnail, duration_seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(sourceId, 'youtube', meta.title, url, '', meta.thumbnail || '', meta.duration || 0, new Date().toISOString())

      db.prepare(
        'INSERT INTO sessions (id, source_id, title, created_at, total_segments) VALUES (?, ?, ?, ?, ?)'
      ).run(sessionId, sourceId, meta.title, new Date().toISOString(), segments.length)

      saveSegments(sessionId, segments, translations)

      sendProgress(win, 'done', 'Import complete!', 100)
      return { sessionId, title: meta.title, segmentCount: segments.length }
    } catch (err) {
      log.error('YouTube import error:', err)
      throw err
    }
  })

  ipcMain.handle('import:file', async (_e, filePath: string) => {
    const win = getWindow()
    const db = getDb()
    const mediaDir = getMediaDir()

    try {
      const ext = path.extname(filePath).toLowerCase()
      const title = path.basename(filePath, ext)

      const isVideoFile = ['.mp4', '.mov', '.mkv', '.avi', '.webm'].includes(ext)
      let audioPath = filePath

      if (isVideoFile) {
        sendProgress(win, 'extract', 'Extracting audio...', 10)
        audioPath = await extractAudio(filePath, mediaDir, (msg) =>
          sendProgress(win, 'extract', msg, 15)
        )
      }

      sendProgress(win, 'transcribe', 'Transcribing with Whisper...', 25)
      const whisperResult = await transcribeAudio(audioPath, (msg) =>
        sendProgress(win, 'transcribe', msg, 30)
      )

      sendProgress(win, 'segment', 'Segmenting...', 60)
      const segments = segmentizeTranscript(whisperResult)

      const translations = await runTranslation(segments, win, 65)

      sendProgress(win, 'saving', 'Saving...', 90)

      const sourceId = `src_${uuidv4()}`
      const sessionId = `ses_${uuidv4()}`

      // Video files: copy the ORIGINAL video to mediaDir so the player can display it.
      // (The extracted WAV in audioPath was only needed for Whisper transcription.)
      // Audio files: copy the audio itself to mediaDir as usual.
      let mediaPath: string
      if (isVideoFile) {
        const videoDestPath = path.join(mediaDir, path.basename(filePath))
        if (filePath !== videoDestPath && !fs.existsSync(videoDestPath)) {
          fs.copyFileSync(filePath, videoDestPath)
        }
        mediaPath = fs.existsSync(videoDestPath) ? videoDestPath : filePath
      } else {
        const destPath = path.join(mediaDir, path.basename(audioPath))
        if (audioPath !== destPath && !fs.existsSync(destPath)) {
          fs.copyFileSync(audioPath, destPath)
        }
        mediaPath = destPath
      }

      db.prepare(
        'INSERT INTO sources (id, type, title, url, local_media_path, thumbnail, duration_seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(sourceId, ext.slice(1) || 'audio', title, '', mediaPath, '', 0, new Date().toISOString())

      db.prepare(
        'INSERT INTO sessions (id, source_id, title, created_at, total_segments) VALUES (?, ?, ?, ?, ?)'
      ).run(sessionId, sourceId, title, new Date().toISOString(), segments.length)

      saveSegments(sessionId, segments, translations)

      sendProgress(win, 'done', 'Import complete!', 100)
      return { sessionId, title, segmentCount: segments.length }
    } catch (err) {
      log.error('File import error:', err)
      throw err
    }
  })

  ipcMain.handle('import:transcript', async (_e, text: string, title: string) => {
    const win = getWindow()
    const db = getDb()
    const mediaDir = getMediaDir()

    try {
      sendProgress(win, 'parse', 'Parsing transcript...', 5)

      // Split by semicolon — each phrase becomes a segment
      const phrases = text
        .split(/;/)
        .map((l) => l.trim())
        .filter((l) => l.length > 1)

      if (phrases.length === 0) throw new Error('No segments found. Use ; to separate sentences.')

      const segments: WhisperSegment[] = phrases.map((l, i) => ({
        id: i,
        start: 0,
        end: 0,
        text: l,
        words: []
      }))

      // Generate TTS audio for each segment
      sendProgress(win, 'tts', `Generating TTS audio (0/${phrases.length})...`, 10)
      const segmentAudioPaths: string[] = []
      const segmentDurations: number[] = []

      for (let i = 0; i < phrases.length; i++) {
        try {
          const audioPath = await generateTts(phrases[i])
          segmentAudioPaths.push(audioPath)
          const dur = await getMediaDuration(audioPath)
          segmentDurations.push(dur || 3)
          sendProgress(win, 'tts', `Generated TTS ${i + 1}/${phrases.length}`, 10 + Math.round((i / phrases.length) * 40))
        } catch (err) {
          log.warn(`TTS failed for segment ${i}:`, err)
          segmentAudioPaths.push('')
          segmentDurations.push(3)
        }
      }

      // Set timestamps based on TTS durations
      let cursor = 0
      for (let i = 0; i < segments.length; i++) {
        segments[i].start = cursor
        segments[i].end = cursor + segmentDurations[i]
        cursor += segmentDurations[i] + 0.3 // 300ms gap between segments
      }

      // Merge all TTS audio into one WAV using ffmpeg concat
      sendProgress(win, 'merge', 'Merging audio...', 55)
      const mergedAudioPath = path.join(mediaDir, `transcript_${Date.now()}.wav`)
      const validPaths = segmentAudioPaths.filter((p) => p && fs.existsSync(p))

      if (validPaths.length > 0) {
        await mergeAudioFiles(validPaths, mergedAudioPath, segmentDurations.filter((_, i) => segmentAudioPaths[i]))
      }

      const translations = await runTranslation(segments, win, 60)

      sendProgress(win, 'saving', 'Saving...', 90)

      const sourceId = `src_${uuidv4()}`
      const sessionId = `ses_${uuidv4()}`

      db.prepare(
        'INSERT INTO sources (id, type, title, url, local_media_path, thumbnail, duration_seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        sourceId, 'transcript', title, '',
        fs.existsSync(mergedAudioPath) ? mergedAudioPath : '',
        '', cursor, new Date().toISOString()
      )

      db.prepare(
        'INSERT INTO sessions (id, source_id, title, created_at, total_segments) VALUES (?, ?, ?, ?, ?)'
      ).run(sessionId, sourceId, title, new Date().toISOString(), segments.length)

      saveSegments(sessionId, segments, translations)

      sendProgress(win, 'done', 'Import complete!', 100)
      return { sessionId, title, segmentCount: segments.length }
    } catch (err) {
      log.error('Transcript import error:', err)
      throw err
    }
  })
}
