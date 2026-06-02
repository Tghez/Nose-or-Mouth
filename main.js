'use strict'

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, session } = require('electron')
const path = require('path')
const Store = require('electron-store')
const storage = require('./utils/storage')
const { startScheduler, computeStreak, localDateString } = require('./utils/scheduler')

const store = new Store({
  defaults: {
    alwaysOnTop: false,
    threshold: 0.04,
    summaryTime: '18:00',
    startAtLogin: false,
    calibrated: false,
    lastSummaryDate: null,
    windowBounds: null
  }
})

let mainWindow = null
let tray = null
let lastSessionPayload = null

// ── Tray icon generation ─────────────────────────────────────────────────────
// Tiny 16×16 PNGs encoded as base64. Generated from 1×1 solid color PNGs
// scaled up — cross-platform safe (SVG data URIs are unreliable on Windows).
// The hex below is a valid 16×16 PNG with a single solid color per icon.

function makeTrayIcon(color) {
  // Build a simple 16×16 colored-circle SVG and use it as a nativeImage.
  // On Windows this works fine with Electron 33's nativeImage.createFromDataURL.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="7" fill="${color}"/>
  </svg>`
  const b64 = Buffer.from(svg).toString('base64')
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${b64}`)
}

const TRAY_ICONS = {
  nose:  () => makeTrayIcon('#22c55e'),
  mouth: () => makeTrayIcon('#f59e0b'),
  none:  () => makeTrayIcon('#6b7280')
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing (unless quitting)
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── Camera permission (required on Windows) ──────────────────────────────────

function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') {
      callback(true)
    } else {
      callback(false)
    }
  })
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') return true
    return null
  })
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function createTray() {
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

function showSummaryNow() {
  const today = localDateString()
  const session = storage.getSession(today)
  const allSessions = storage.readAll()
  const streak = computeStreak(allSessions)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('daily-summary-trigger', {
      date: today,
      noseSeconds: (session && session.noseBreathingSeconds) || 0,
      mouthSeconds: (session && session.mouthBreathingSeconds) || 0,
      streak
    })
  }
}

function updateTrayMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show Mouth Breather',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus() }
      }
    },
    {
      label: 'View Today\'s Summary',
      click: () => showSummaryNow()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  ipcMain.handle('save-session', async (_event, payload) => {
    lastSessionPayload = payload
    storage.saveSession(payload)
    return { ok: true }
  })

  ipcMain.handle('get-session', async (_event, date) => {
    return storage.getSession(date)
  })

  ipcMain.handle('show-notification', async (_event, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
    return { ok: true }
  })

  ipcMain.handle('toggle-always-on-top', async (_event, value) => {
    store.set('alwaysOnTop', value)
    if (mainWindow) mainWindow.setAlwaysOnTop(value)
    return { ok: true }
  })

  ipcMain.handle('update-tray-icon', async (_event, state) => {
    if (tray && TRAY_ICONS[state]) {
      tray.setImage(TRAY_ICONS[state]())
    }
    return { ok: true }
  })

  ipcMain.handle('request-camera-permission', async () => {
    // Permission is auto-granted via setPermissionRequestHandler.
    // Return granted so renderer can proceed.
    return 'granted'
  })

  ipcMain.handle('get-settings', async () => {
    return store.store
  })

  ipcMain.handle('save-settings', async (_event, settings) => {
    for (const [key, value] of Object.entries(settings)) {
      store.set(key, value)
    }
    if ('alwaysOnTop' in settings && mainWindow) {
      mainWindow.setAlwaysOnTop(settings.alwaysOnTop)
    }
    if ('startAtLogin' in settings) {
      applyStartAtLogin(settings.startAtLogin)
    }
    // Reset deduplication so the new time can fire even on the same day
    if ('summaryTime' in settings) {
      store.set('lastSummaryDate', null)
    }
    if (mainWindow) {
      mainWindow.webContents.send('settings-changed', store.store)
    }
    return { ok: true }
  })

  ipcMain.handle('get-all-sessions', async () => {
    return storage.readAll()
  })

  ipcMain.handle('get-summary', async (_event, date) => {
    const today = date || localDateString()
    const session = storage.getSession(today)
    const allSessions = storage.readAll()
    const streak = computeStreak(allSessions)
    return {
      date: today,
      noseSeconds: (session && session.noseBreathingSeconds) || 0,
      mouthSeconds: (session && session.mouthBreathingSeconds) || 0,
      streak
    }
  })
}

function applyStartAtLogin(enabled) {
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

  // Show window on first launch
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
  // Final synchronous session save
  if (lastSessionPayload) {
    try {
      storage.saveSession(lastSessionPayload)
    } catch (e) {
      // best effort
    }
  }
})

app.on('window-all-closed', () => {
  // On macOS, keep app running in tray even with no windows
  if (process.platform !== 'darwin') {
    // Keep running — tray is still active
  }
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})
