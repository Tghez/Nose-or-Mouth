import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, session, screen } from 'electron'
import type { NativeImage } from 'electron'
import { join } from 'path'
import { execFileSync } from 'child_process'
import Store from 'electron-store'
import * as storage from './utils/storage'
import { startScheduler, computeStreak, localDateString } from './utils/scheduler'
import type { StoreSchema, Session, SummaryData } from '../types/session'

// Remove macOS quarantine flag on first launch so subsequent opens work without Gatekeeper warnings
if (process.platform === 'darwin' && app.isPackaged) {
  const bundleMatch = process.execPath.match(/^(.*?\.app)\//)
  if (bundleMatch) {
    try { execFileSync('xattr', ['-d', 'com.apple.quarantine', bundleMatch[1]], { stdio: 'ignore' }) } catch { /* not set */ }
  }
}

// app doesn't type isQuitting, but we set it as a quit guard flag
const appState = app as typeof app & { isQuitting: boolean }

const store = new Store<StoreSchema>({
  defaults: {
    alwaysOnTop: false,
    threshold: 0.07,
    summaryTime: '18:00',
    startAtLogin: false,
    calibrated: false,
    tutorialSeen: false,
    lastSummaryDate: null,
    windowBounds: null,
    cameraPermission: false,
    alertEnabled: true,
    alertWindowSeconds: 120,
    alertProportionThreshold: 0.6,
  }
})

const MINI_W = 220
const MINI_H = 70
const FULL_W = 420
const FULL_H = 538  // 510px app + 28px custom title bar

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let lastSessionPayload: Session | null = null
let isMiniMode = false
let isAnyModalOpen = false
let savedBounds: { x: number; y: number; width: number; height: number } | null = null

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

// ── Mini mode ─────────────────────────────────────────────────────────────────

function enterMiniMode(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  isMiniMode = true
  savedBounds = mainWindow.getBounds()
  mainWindow.setAlwaysOnTop(true)
  // Notify renderer first so React paints MiniView before the window shrinks
  mainWindow.webContents.send('mini-mode-changed', true)
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const { workArea } = screen.getDisplayNearestPoint({ x: savedBounds!.x, y: savedBounds!.y })
    mainWindow.setMinimumSize(1, 1)
    mainWindow.setMaximumSize(0, 0)
    mainWindow.setBounds({
      x: workArea.x + workArea.width - MINI_W - 16,
      y: workArea.y + 16,
      width: MINI_W,
      height: MINI_H
    })
    mainWindow.setMinimumSize(MINI_W, MINI_H)
    mainWindow.setMaximumSize(MINI_W, MINI_H)
  }, 60)
}

function exitMiniMode(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  isMiniMode = false
  mainWindow.setAlwaysOnTop(store.get('alwaysOnTop'))
  mainWindow.setMinimumSize(1, 1)
  mainWindow.setMaximumSize(0, 0)
  if (savedBounds) {
    mainWindow.setBounds({ ...savedBounds, width: FULL_W, height: FULL_H })
    savedBounds = null
  } else {
    mainWindow.setSize(FULL_W, FULL_H)
  }
  mainWindow.setMinimumSize(FULL_W, FULL_H)
  mainWindow.setMaximumSize(FULL_W, FULL_H)
  // Notify renderer after window is at full size so content renders into the right viewport
  setTimeout(() => mainWindow?.webContents.send('mini-mode-changed', false), 30)
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 538,
    minWidth: 420,
    minHeight: 538,
    maxWidth: 420,
    maxHeight: 538,
    resizable: false,
    frame: false,
    autoHideMenuBar: true,
    alwaysOnTop: store.get('alwaysOnTop'),
    skipTaskbar: false,
    title: 'Mouth Breather',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('minimize', () => {
    if (!isMiniMode && !isAnyModalOpen) {
      mainWindow!.restore()
      enterMiniMode()
    }
  })

  mainWindow.on('close', () => {
    appState.isQuitting = true
    app.quit()
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

  ipcMain.handle('show-alert-window', async (_event, { title, body }: { title: string; body: string }) => {
    const { workArea } = screen.getPrimaryDisplay()
    const winW = 320
    const winH = 120
    const x = workArea.x + Math.floor((workArea.width  - winW) / 2)
    const y = workArea.y + Math.floor((workArea.height - winH) / 2)

    const alertWin = new BrowserWindow({
      x, y,
      width: winW,
      height: winH,
      minWidth: winW, minHeight: winH,
      maxWidth: winW, maxHeight: winH,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    alertWin.setIgnoreMouseEvents(false)

    const query = { title, body }
    if (process.env.ELECTRON_RENDERER_URL) {
      const u = new URL(`${process.env.ELECTRON_RENDERER_URL}/alert.html`)
      u.searchParams.set('title', title)
      u.searchParams.set('body', body)
      alertWin.loadURL(u.toString())
    } else {
      alertWin.loadFile(join(__dirname, '../renderer/alert.html'), { query })
    }

    alertWin.once('ready-to-show', () => alertWin.show())

    // Safety: force-destroy after 3 s in case the page never calls window.close()
    const safetyTimer = setTimeout(() => {
      if (!alertWin.isDestroyed()) alertWin.destroy()
    }, 3000)
    alertWin.once('closed', () => clearTimeout(safetyTimer))
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

  ipcMain.handle('set-modal-open', async (_event, open: boolean) => {
    isAnyModalOpen = open
  })

  ipcMain.handle('exit-mini-mode', async () => {
    exitMiniMode()
  })

  ipcMain.handle('enter-mini-mode', async () => {
    enterMiniMode()
  })

  ipcMain.handle('quit-app', async () => {
    appState.isQuitting = true
    app.quit()
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
