import { BrowserWindow, dialog, ipcMain } from 'electron'
import log from 'electron-log'
import { exportAllData, importAllData } from '../services/exportImport'

export function registerDataHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('data:export', async () => {
    const win = getWindow()
    const stamp = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog({
      title: 'Export all Daily Speaking data',
      defaultPath: `daily-speaking-backup-${stamp}.zip`,
      filters: [{ name: 'Zip archive', extensions: ['zip'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }

    const send = (msg: string): void => {
      win?.webContents.send('data:progress', { msg })
    }
    try {
      const exported = await exportAllData(result.filePath, send)
      return { canceled: false, ...exported }
    } catch (err) {
      log.error('Export failed:', err)
      throw err
    }
  })

  ipcMain.handle('data:import', async () => {
    const win = getWindow()
    const picked = await dialog.showOpenDialog({
      title: 'Import Daily Speaking backup',
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
      properties: ['openFile']
    })
    const srcZip = picked.filePaths[0]
    if (picked.canceled || !srcZip) return { canceled: true }

    const confirm = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Import and replace', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'Replace all local data?',
      detail: 'Importing a backup replaces the current database (sessions, flashcards, history) on this machine. Media files are merged. This cannot be undone.'
    })
    if (confirm.response !== 0) return { canceled: true }

    const send = (msg: string): void => {
      win?.webContents.send('data:progress', { msg })
    }
    try {
      const imported = await importAllData(srcZip, send)
      return { canceled: false, ...imported }
    } catch (err) {
      log.error('Import failed:', err)
      throw err
    }
  })
}
