import { app, BrowserWindow, shell, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log'
import { initDatabase } from './services/database'
import { registerSessionHandlers } from './ipc/sessions'
import { registerImportHandlers } from './ipc/import'
import { registerPracticeHandlers } from './ipc/practice'
import { registerTranslateHandlers } from './ipc/translate'
import { registerFlashcardHandlers } from './ipc/flashcards'
import { registerDashboardHandlers } from './ipc/dashboard'
import { registerSettingsHandlers } from './ipc/settings'
import { registerTtsHandlers } from './ipc/tts'

log.initialize()
log.transports.file.level = 'info'

let mainWindow: BrowserWindow | null = null

function getWindow(): BrowserWindow | null {
  return mainWindow
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f8f9ff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.dailyspeaking.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  try {
    initDatabase()
  } catch (err) {
    log.error('Database init failed:', err)
    dialog.showErrorBox('Database Error', String(err))
    app.quit()
    return
  }

  registerSessionHandlers()
  registerImportHandlers(getWindow)
  registerPracticeHandlers(getWindow)
  registerTranslateHandlers()
  registerFlashcardHandlers()
  registerDashboardHandlers()
  registerSettingsHandlers()
  registerTtsHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
