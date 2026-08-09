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
  // Renamed from tutorialSeen when the tutorial was redesigned, so users who
  // already dismissed the old one see the new spotlight tour once more.
  tutorialSeenV2: boolean
  lastSummaryDate: string | null
  windowBounds: { x: number; y: number; width: number; height: number } | null
  cameraPermission: boolean
  alertEnabled: boolean
  alertWindowSeconds: number
  alertProportionThreshold: number
  lightMode: boolean
}

export interface SummaryData {
  date: string
  noseSeconds: number
  mouthSeconds: number
  streak: number
}

export interface WeekSession {
  date: string
  noseSeconds: number
  mouthSeconds: number
}
