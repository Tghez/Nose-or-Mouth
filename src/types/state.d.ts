import type { StoreSchema } from './session'

export interface AppState {
  mouthOpen: boolean
  faceDetected: boolean
  paused: boolean
  noFaceTimer: ReturnType<typeof setTimeout> | null
  noseSeconds: number
  mouthSeconds: number
  baseNoseSeconds: number
  baseMouthSeconds: number
  sessionStart: string
  threshold: number
  cameraReady: boolean
  mediapipeReady: boolean
  settings: Partial<StoreSchema>
}

export interface CalibrationState {
  active: boolean
  collecting: boolean
  samples: number[]
  step: number
}
