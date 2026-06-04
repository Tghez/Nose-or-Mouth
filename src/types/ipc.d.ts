import type { Session, StoreSchema, SummaryData } from './session'

export interface ElectronAPI {
  saveSession: (payload: Session) => Promise<{ ok: boolean }>
  getSession: (date: string) => Promise<Session | null>
  getAllSessions: () => Promise<Session[]>
  showNotification: (opts: { title: string; body: string }) => Promise<{ ok: boolean }>
  toggleAlwaysOnTop: (value: boolean) => Promise<{ ok: boolean }>
  updateTrayIcon: (state: 'nose' | 'mouth' | 'none') => Promise<{ ok: boolean }>
  requestCameraPermission: () => Promise<'granted' | 'denied'>
  getSettings: () => Promise<StoreSchema>
  saveSettings: (settings: Partial<StoreSchema>) => Promise<{ ok: boolean }>
  getSummary: (date?: string) => Promise<SummaryData>
  onDailySummaryTrigger: (cb: (data: SummaryData) => void) => void
  onSettingsChanged: (cb: (settings: StoreSchema) => void) => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
