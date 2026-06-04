export interface Session {
  date: string
  sessionStart: string
  noseBreathingSeconds: number
  mouthBreathingSeconds: number
}

export interface StoreSchema {
  alwaysOnTop: boolean
  threshold: number
  summaryTime: string
  startAtLogin: boolean
  calibrated: boolean
  tutorialSeen: boolean
  lastSummaryDate: string | null
  windowBounds: { x: number; y: number; width: number; height: number } | null
  cameraPermission: boolean
}

export interface SummaryData {
  date: string
  noseSeconds: number
  mouthSeconds: number
  streak: number
}
