import { ipcMain } from 'electron'
import { interactiveTranslate } from '../services/ollama'
import { getDb } from '../services/database'

export function registerTranslateHandlers(): void {
  ipcMain.handle('translate:interactive', async (_e, text: string) => {
    return interactiveTranslate(text)
  })

  ipcMain.handle('translate:segment:update', (_e, segmentId: string, translate: string) => {
    getDb()
      .prepare('UPDATE segments SET translate = ? WHERE id = ?')
      .run(translate, segmentId)
    return true
  })
}
