import path from 'path'
import fs from 'fs'
import log from 'electron-log'
import { getDb, getSetting, setSetting, getMediaDir } from './database'

/**
 * One-time migration: YouTube sessions used to keep a downloaded .mp4 (or
 * audio file) on disk. Playback now streams from YouTube, so those files —
 * plus orphaned transcription audio — are deleted and the sources are
 * switched to stream mode (empty local_media_path).
 */
export function migrateYoutubeToStream(): void {
  if (getSetting('yt_stream_migrated') === '1') return
  const db = getDb()
  const mediaDir = getMediaDir()

  const ytSources = db
    .prepare("SELECT id, local_media_path FROM sources WHERE type = 'youtube' AND local_media_path IS NOT NULL AND local_media_path != ''")
    .all() as { id: string; local_media_path: string }[]

  let freedBytes = 0
  const removeFile = (p: string): void => {
    try {
      if (p && fs.existsSync(p) && fs.statSync(p).isFile()) {
        freedBytes += fs.statSync(p).size
        fs.unlinkSync(p)
      }
    } catch (err) {
      log.warn('yt-stream migration: could not delete', p, err)
    }
  }

  for (const src of ytSources) {
    removeFile(src.local_media_path)
  }
  if (ytSources.length > 0) {
    db.prepare("UPDATE sources SET local_media_path = '' WHERE type = 'youtube'").run()
  }

  // Orphaned files in media/: yt-dlp downloads (yt_*, yt_vid_*) and extracted
  // transcription audio (audio_*.wav) that no source references anymore.
  const referenced = new Set(
    (db.prepare("SELECT local_media_path FROM sources WHERE local_media_path IS NOT NULL AND local_media_path != ''").all() as { local_media_path: string }[])
      .map((r) => path.basename(r.local_media_path))
  )
  for (const name of fs.readdirSync(mediaDir)) {
    const isYtLeftover = name.startsWith('yt_') || name.startsWith('yt_vid_')
    const isExtractLeftover = name.startsWith('audio_') && name.endsWith('.wav')
    if ((isYtLeftover || isExtractLeftover) && !referenced.has(name)) {
      removeFile(path.join(mediaDir, name))
    }
  }

  setSetting('yt_stream_migrated', '1')
  log.info(`yt-stream migration: ${ytSources.length} sources switched, freed ${(freedBytes / 1024 / 1024).toFixed(1)} MB`)
}
