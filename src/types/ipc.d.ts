import type { Session, StoreSchema, SummaryData } from './session'

export interface ElectronAPI {
  saveSession: (payload: Session) => Promise<{ ok: boolean }>
  getSession: (date: string) => Promise<Session | null>
  getAllSessions: () => Promise<Session[]>
  showNotification: (opts: { title: string; body: string }) => Promise<{ ok: boolean }>
  showAlertWindow: (title: string, body: string) => Promise<void>
  toggleAlwaysOnTop: (value: boolean) => Promise<{ ok: boolean }>
  updateTrayIcon: (state: 'nose' | 'mouth' | 'none') => Promise<{ ok: boolean }>
  requestCameraPermission: () => Promise<'granted' | 'denied'>
  getSettings: () => Promise<StoreSchema>
  saveSettings: (settings: Partial<StoreSchema>) => Promise<{ ok: boolean }>
  getSummary: (date?: string) => Promise<SummaryData>
  openExternal: (url: string) => Promise<void>
  onDailySummaryTrigger: (cb: (data: SummaryData) => void) => void
  onSettingsChanged: (cb: (settings: StoreSchema) => void) => void
  onAuthCallback: (cb: (url: string) => void) => void
  exitMiniMode: () => Promise<void>
  enterMiniMode: () => Promise<void>
  quitApp: () => Promise<void>
  setModalOpen: (open: boolean) => Promise<void>
  onMiniModeChanged: (cb: (mini: boolean) => void) => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
