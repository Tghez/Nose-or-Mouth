import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, session } from 'electron'
import type { NativeImage } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import * as storage from './utils/storage'
import { startScheduler, computeStreak, localDateString } from './utils/scheduler'
import type { StoreSchema, Session, SummaryData } from '../types/session'

// app doesn't type isQuitting, but we set it as a quit guard flag
const appState = app as typeof app & { isQuitting: boolean }

const store = new Store<StoreSchema>({
  defaults: {
    alwaysOnTop: false,
    threshold: 0.04,
    summaryTime: '18:00',
    startAtLogin: false,
    calibrated: false,
    tutorialSeen: false,
    lastSummaryDate: null,
    windowBounds: null,
    cameraPermission: false,
    mouthAlertThresholdSeconds: 300
  }
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let lastSessionPayload: Session | null = null

// ── Tray icon generation ──────────────────────────────────────────────────────

function makeTrayIcon(color: string): NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="7" fill="${color}"/>
  </svg>`
  const b64 = Buffer.from(svg).toString('base64')
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${b64}`)
}

const TRAY_ICONS: Record<string, () => NativeImage> = {
  nose:  () => makeTrayIcon('#22c55e'),
  mouth: () => makeTrayIcon('#f59e0b'),
  none:  () => makeTrayIcon('#6b7280')
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 510,
    minWidth: 420,
    minHeight: 510,
    maxWidth: 420,
    maxHeight: 510,
    resizable: false,
    frame: true,
    alwaysOnTop: store.get('alwaysOnTop'),
    skipTaskbar: false,
    title: 'Mouth Breather',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('close', (e: Electron.Event) => {
    if (!appState.isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── Camera permission ─────────────────────────────────────────────────────────

function setupPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') {
      callback(true)
    } else {
      callback(false)
    }
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'media') return true
    return false
  })
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function showSummaryNow(): void {
  const today = localDateString()
  const sess = storage.getSession(today)
  const allSessions = storage.readAll()
  const streak = computeStreak(allSessions)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    const payload: SummaryData = {
      date: today,
      noseSeconds: sess?.noseBreathingSeconds ?? 0,
      mouthSeconds: sess?.mouthBreathingSeconds ?? 0,
      streak
    }
    mainWindow.webContents.send('daily-summary-trigger', payload)
  }
}

function updateTrayMenu(): void {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show Mouth Breather',
      click: () => { mainWindow?.show(); mainWindow?.focus() }
    },
    {
      label: "View Today's Summary",
      click: () => showSummaryNow()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        appState.isQuitting = true
        app.quit()
      }
    }
  ])
  tray?.setContextMenu(menu)
}

function createTray(): void {
  tray = new Tray(TRAY_ICONS.none())
  tray.setToolTip('Mouth Breather')
  updateTrayMenu()

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  ipcMain.handle('save-session', async (_event, payload: Session) => {
    lastSessionPayload = payload
    storage.saveSession(payload)
    return { ok: true }
  })

  ipcMain.handle('get-session', async (_event, date: string) => {
    return storage.getSession(date)
  })

  ipcMain.handle('show-notification', async (_event, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
    return { ok: true }
  })

  ipcMain.handle('toggle-always-on-top', async (_event, value: boolean) => {
    store.set('alwaysOnTop', value)
    mainWindow?.setAlwaysOnTop(value)
    return { ok: true }
  })

  ipcMain.handle('update-tray-icon', async (_event, state: string) => {
    if (tray && TRAY_ICONS[state]) {
      tray.setImage(TRAY_ICONS[state]())
    }
    return { ok: true }
  })

  ipcMain.handle('request-camera-permission', async () => {
    return 'granted'
  })

  ipcMain.handle('get-settings', async () => {
    return store.store
  })

  ipcMain.handle('save-settings', async (_event, settings: Partial<StoreSchema>) => {
    for (const [key, value] of Object.entries(settings) as [keyof StoreSchema, StoreSchema[keyof StoreSchema]][]) {
      store.set(key, value)
    }
    if ('alwaysOnTop' in settings && mainWindow) {
      mainWindow.setAlwaysOnTop(settings.alwaysOnTop!)
    }
    if ('startAtLogin' in settings) {
      applyStartAtLogin(settings.startAtLogin!)
    }
    if ('summaryTime' in settings) {
      store.set('lastSummaryDate', null)
    }
    mainWindow?.webContents.send('settings-changed', store.store)
    return { ok: true }
  })

  ipcMain.handle('get-all-sessions', async () => {
    return storage.readAll()
  })

  ipcMain.handle('get-summary', async (_event, date?: string) => {
    const today = date ?? localDateString()
    const sess = storage.getSession(today)
    const allSessions = storage.readAll()
    const streak = computeStreak(allSessions)
    const payload: SummaryData = {
      date: today,
      noseSeconds: sess?.noseBreathingSeconds ?? 0,
      mouthSeconds: sess?.mouthBreathingSeconds ?? 0,
      streak
    }
    return payload
  })
}

function applyStartAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true
  })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  setupPermissions()
  createWindow()
  createTray()
  registerIpcHandlers()

  startScheduler(store, () => mainWindow, storage)

  mainWindow?.show()
  mainWindow?.focus()
})

app.on('before-quit', () => {
  appState.isQuitting = true
  if (lastSessionPayload) {
    try {
      storage.saveSession(lastSessionPayload)
    } catch {
      // best effort
    }
  }
})

app.on('window-all-closed', () => {
  // Keep running — tray is still active
})

app.on('activate', () => {
  mainWindow?.show()
  mainWindow?.focus()
})
