import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../types/ipc'

const api: ElectronAPI = {
  // ── Renderer → Main ──────────────────────────────────────────────────────
  saveSession:             (payload)  => ipcRenderer.invoke('save-session', payload),
  getSession:              (date)     => ipcRenderer.invoke('get-session', date),
  getAllSessions:           ()         => ipcRenderer.invoke('get-all-sessions'),
  showNotification:        (opts)     => ipcRenderer.invoke('show-notification', opts),
  toggleAlwaysOnTop:       (value)    => ipcRenderer.invoke('toggle-always-on-top', value),
  updateTrayIcon:          (state)    => ipcRenderer.invoke('update-tray-icon', state),
  requestCameraPermission: ()         => ipcRenderer.invoke('request-camera-permission'),
  getSettings:             ()         => ipcRenderer.invoke('get-settings'),
  saveSettings:            (settings) => ipcRenderer.invoke('save-settings', settings),
  getSummary:              (date)     => ipcRenderer.invoke('get-summary', date),

  // ── Main → Renderer (push events) ────────────────────────────────────────
  onDailySummaryTrigger: (cb) => ipcRenderer.on('daily-summary-trigger', (_e, data) => cb(data)),
  onSettingsChanged:     (cb) => ipcRenderer.on('settings-changed', (_e, data) => cb(data)),

  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
}

contextBridge.exposeInMainWorld('electronAPI', api)
