import { ipcMain } from 'electron'
import log from 'electron-log'
import { generateTts } from '../services/tts'

export function registerTtsHandlers(): void {
  ipcMain.handle('tts:speak', async (_e, text: string, voice?: string) => {
    try {
      const audioPath = await generateTts(text, voice || 'tara')
      return { path: audioPath }
    } catch (err) {
      log.error('TTS error:', err)
      throw err
    }
  })
}
