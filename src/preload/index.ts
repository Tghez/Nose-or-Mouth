import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../types/ipc'

const api: ElectronAPI = {
  // ── Renderer → Main ──────────────────────────────────────────────────────
  saveSession:             (payload)  => ipcRenderer.invoke('save-session', payload),
  getSession:              (date)     => ipcRenderer.invoke('get-session', date),
  getAllSessions:           ()         => ipcRenderer.invoke('get-all-sessions'),
  showNotification:        (opts)     => ipcRenderer.invoke('show-notification', opts),
  showAlertWindow:         (title, body) => ipcRenderer.invoke('show-alert-window', { title, body }),
  toggleAlwaysOnTop:       (value)    => ipcRenderer.invoke('toggle-always-on-top', value),
  updateTrayIcon:          (state)    => ipcRenderer.invoke('update-tray-icon', state),
  requestCameraPermission: ()         => ipcRenderer.invoke('request-camera-permission'),
  getSettings:             ()         => ipcRenderer.invoke('get-settings'),
  saveSettings:            (settings) => ipcRenderer.invoke('save-settings', settings),
  getSummary:              (date)     => ipcRenderer.invoke('get-summary', date),
  openExternal:            (url)      => ipcRenderer.invoke('open-external', url),

  // ── Main → Renderer (push events) ────────────────────────────────────────
  onDailySummaryTrigger: (cb) => ipcRenderer.on('daily-summary-trigger', (_e, data) => cb(data)),
  onSettingsChanged:     (cb) => ipcRenderer.on('settings-changed', (_e, data) => cb(data)),
  onAuthCallback:        (cb) => ipcRenderer.on('auth-callback', (_e, url) => cb(url)),
  exitMiniMode:          ()       => ipcRenderer.invoke('exit-mini-mode'),
  enterMiniMode:         ()       => ipcRenderer.invoke('enter-mini-mode'),
  quitApp:               ()       => ipcRenderer.invoke('quit-app'),
  minimizeWindow:        ()       => ipcRenderer.invoke('minimize-window'),
  setModalOpen:          (open)   => ipcRenderer.invoke('set-modal-open', open),
  onMiniModeChanged:     (cb) => ipcRenderer.on('mini-mode-changed', (_e, mini) => cb(mini)),
  onScreenLockChanged:   (cb) => ipcRenderer.on('screen-lock-changed', (_e, locked) => cb(locked)),

  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
}

contextBridge.exposeInMainWorld('electronAPI', api)
