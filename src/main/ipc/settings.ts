import { ipcMain, dialog } from 'electron'
import { getSetting, setSetting, getDb } from '../services/database'
import { listModels } from '../services/ollama'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => {
    const keys = [
      'ollama_base_url', 'whisper_model', 'bulk_translate_model',
      'interactive_translate_model', 'analysis_model', 'embedding_model',
      'tts_model', 'low_score_threshold', 'translate_workers', 'max_due_cards'
    ]
    const result: Record<string, string> = {}
    for (const k of keys) {
      result[k] = getSetting(k) || ''
    }
    return result
  })

  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    setSetting(key, value)
    return true
  })

  ipcMain.handle('settings:set-all', (_e, data: Record<string, string>) => {
    for (const [k, v] of Object.entries(data)) {
      setSetting(k, v)
    }
    return true
  })

  ipcMain.handle('models:list', async () => {
    return listModels()
  })

  ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog({
      filters: [
        { name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'mp3', 'wav', 'm4a', 'flac'] }
      ],
      properties: ['openFile']
    })
    return result.filePaths[0] || null
  })

  ipcMain.handle('models:status', async () => {
    const models = await listModels()
    const required: Record<string, string> = {
      'bulk_translate_model': getSetting('bulk_translate_model') || 'scb10x/typhoon-translate1.5-4b',
      'interactive_translate_model': getSetting('interactive_translate_model') || 'scb10x/typhoon-translate1.5-4b',
      'analysis_model': getSetting('analysis_model') || 'qwen3.5:9b',
      'embedding_model': getSetting('embedding_model') || 'bge-m3',
      'tts_model': getSetting('tts_model') || 'legraphista/Orpheus:latest'
    }

    return Object.entries(required).map(([role, model]) => ({
      role,
      model,
      available: models.some((m) => m.startsWith(model) || m === model),
      readonly: role === 'tts_model'
    }))
  })
}
