import { app } from 'electron'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import log from 'electron-log'
import { getDb, closeDatabase, initDatabase, getMediaDir, getRecordingsDir, getTtsCacheDir } from './database'

const EXPORT_DB_NAME = 'daily-speaking-export.db'
const MANIFEST_NAME = 'daily-speaking-manifest.json'

function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd })
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(0, 300)}`))
    })
    proc.on('error', (e) => reject(new Error(`Cannot run ${cmd}: ${e.message}`)))
  })
}

export async function exportAllData(
  destZip: string,
  onProgress?: (msg: string) => void
): Promise<{ path: string; sizeBytes: number }> {
  const userData = app.getPath('userData')
  const db = getDb()

  onProgress?.('Snapshotting the database...')
  const exportDbPath = path.join(userData, EXPORT_DB_NAME)
  if (fs.existsSync(exportDbPath)) fs.unlinkSync(exportDbPath)
  await db.backup(exportDbPath)

  const manifestPath = path.join(userData, MANIFEST_NAME)
  fs.writeFileSync(manifestPath, JSON.stringify({
    app: 'daily-speaking',
    version: app.getVersion(),
    exported_at: new Date().toISOString(),
    platform: process.platform
  }, null, 2))

  // Ensure dirs exist so zip entries are stable
  getMediaDir()
  getRecordingsDir()
  getTtsCacheDir()

  onProgress?.('Compressing database, media, recordings and voice cache...')
  if (fs.existsSync(destZip)) fs.unlinkSync(destZip)
  const entries = [EXPORT_DB_NAME, MANIFEST_NAME, 'media', 'recordings', 'tts_cache']
    .filter((entry) => fs.existsSync(path.join(userData, entry)))
  await run('zip', ['-r', '-q', destZip, ...entries], userData)

  fs.unlinkSync(exportDbPath)
  fs.unlinkSync(manifestPath)

  const sizeBytes = fs.statSync(destZip).size
  log.info('Export complete:', destZip, sizeBytes, 'bytes')
  return { path: destZip, sizeBytes }
}

function copyDirInto(srcDir: string, destDir: string): number {
  if (!fs.existsSync(srcDir)) return 0
  fs.mkdirSync(destDir, { recursive: true })
  let count = 0
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name)
    const dest = path.join(destDir, name)
    if (fs.statSync(src).isDirectory()) {
      count += copyDirInto(src, dest)
    } else {
      fs.copyFileSync(src, dest)
      count += 1
    }
  }
  return count
}

function rewritePathColumn(table: string, column: string, newDir: string): number {
  const db = getDb()
  const rows = db.prepare(`SELECT rowid, ${column} as p FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`).all() as
    { rowid: number; p: string }[]
  const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`)
  let changed = 0
  const tx = db.transaction(() => {
    for (const row of rows) {
      const rewritten = path.join(newDir, path.basename(row.p))
      if (rewritten !== row.p) {
        update.run(rewritten, row.rowid)
        changed += 1
      }
    }
  })
  tx()
  return changed
}

export async function importAllData(
  srcZip: string,
  onProgress?: (msg: string) => void
): Promise<{ sessions: number; flashcards: number; mediaFiles: number }> {
  const userData = app.getPath('userData')
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-import-'))

  try {
    onProgress?.('Unpacking the backup zip...')
    await run('unzip', ['-o', '-q', srcZip, '-d', tempDir])

    const importedDb = path.join(tempDir, EXPORT_DB_NAME)
    if (!fs.existsSync(importedDb)) {
      throw new Error('Not a Daily Speaking backup: database file missing from the zip')
    }
    const manifestPath = path.join(tempDir, MANIFEST_NAME)
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { app?: string }
      if (manifest.app !== 'daily-speaking') throw new Error('Not a Daily Speaking backup: wrong manifest')
    }

    onProgress?.('Copying media, recordings and voice cache...')
    let mediaFiles = 0
    mediaFiles += copyDirInto(path.join(tempDir, 'media'), getMediaDir())
    mediaFiles += copyDirInto(path.join(tempDir, 'recordings'), getRecordingsDir())
    copyDirInto(path.join(tempDir, 'tts_cache'), getTtsCacheDir())

    onProgress?.('Replacing the local database...')
    closeDatabase()
    const dbPath = path.join(userData, 'daily-speaking.db')
    for (const suffix of ['', '-wal', '-shm']) {
      const p = dbPath + suffix
      if (fs.existsSync(p)) fs.unlinkSync(p)
    }
    fs.copyFileSync(importedDb, dbPath)
    initDatabase()

    onProgress?.('Relinking media paths for this machine...')
    rewritePathColumn('sources', 'local_media_path', getMediaDir())
    rewritePathColumn('practice_attempts', 'audio_path', getRecordingsDir())
    rewritePathColumn('speaking_answers', 'audio_path', getRecordingsDir())

    const db = getDb()
    const sessions = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c
    const flashcards = (db.prepare('SELECT COUNT(*) as c FROM flashcards').get() as { c: number }).c
    log.info('Import complete:', sessions, 'sessions,', flashcards, 'flashcards,', mediaFiles, 'media files')
    return { sessions, flashcards, mediaFiles }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}
