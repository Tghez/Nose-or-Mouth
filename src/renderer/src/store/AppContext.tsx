import { createContext, useContext, useReducer } from 'react'
import type { ReactNode, Dispatch } from 'react'
import type { StoreSchema, SummaryData } from '../../../types/session'

export interface AppContextState {
  mouthOpen: boolean
  faceDetected: boolean
  lipsOccluded: boolean
  paused: boolean
  cameraReady: boolean
  mediapipeReady: boolean
  isMiniMode: boolean
  noseSeconds: number
  mouthSeconds: number
  baseNoseSeconds: number
  baseMouthSeconds: number
  sessionStart: string
  threshold: number
  settings: Partial<StoreSchema>
  showSettings: boolean
  showSummary: boolean
  showCalibration: boolean
  showTutorial: boolean
  showOnboarding: boolean
  showAuthModal: boolean
  showLimitOverlay: boolean
  showAlertPopup: boolean
  statusText: string
  toastMessage: string | null
  faceMeshVisible: boolean
  cameraEnabled: boolean
  summaryData: SummaryData | null
  alertFired: boolean
  alertWindowStartMs: number
  mouthClockFilled: number
  noseClockFilled: number
  mouthClockSegments: number
  noseClockSegments: number
}

type ModalName = 'settings' | 'summary' | 'calibration' | 'tutorial' | 'onboarding' | 'auth' | 'limit' | 'alert'

export type AppAction =
  | { type: 'SET_DETECTION_STATE'; payload: { mouthOpen: boolean; faceDetected: boolean; lipsOccluded: boolean; paused: boolean } }
  | { type: 'TICK_NOSE' }
  | { type: 'TICK_MOUTH' }
  | { type: 'SET_BASE_SECONDS'; payload: { baseNoseSeconds: number; baseMouthSeconds: number } }
  | { type: 'SET_THRESHOLD'; payload: number }
  | { type: 'SET_SETTINGS'; payload: Partial<StoreSchema> }
  | { type: 'SET_STATUS'; payload: string }
  | { type: 'SHOW_MODAL'; payload: ModalName }
  | { type: 'HIDE_MODAL'; payload: ModalName }
  | { type: 'SET_CAMERA_READY'; payload: boolean }
  | { type: 'SET_MEDIAPIPE_READY'; payload: boolean }
  | { type: 'SET_CAMERA_ENABLED'; payload: boolean }
  | { type: 'SET_FACE_MESH_VISIBLE'; payload: boolean }
  | { type: 'SET_ALERT_STATE'; payload: { alertFired: boolean; alertWindowStartMs: number } }
  | { type: 'SET_CLOCK_STATE'; payload: { mouthClockFilled: number; noseClockFilled: number; mouthClockSegments: number; noseClockSegments: number; alertFired: boolean; alertWindowStartMs: number } }
  | { type: 'SET_TOAST'; payload: string | null }
  | { type: 'SET_SUMMARY_DATA'; payload: SummaryData }
  | { type: 'RESET_DAY' }
  | { type: 'SET_MINI_MODE'; payload: boolean }

const initialState: AppContextState = {
  mouthOpen: false,
  faceDetected: false,
  lipsOccluded: false,
  paused: true,
  cameraReady: false,
  mediapipeReady: false,
  isMiniMode: false,
  noseSeconds: 0,
  mouthSeconds: 0,
  baseNoseSeconds: 0,
  baseMouthSeconds: 0,
  sessionStart: new Date().toISOString(),
  threshold: 0.2,
  settings: {},
  showSettings: false,
  showSummary: false,
  showCalibration: false,
  showTutorial: false,
  showOnboarding: false,
  showAuthModal: false,
  showLimitOverlay: false,
  showAlertPopup: false,
  statusText: 'Initializing…',
  toastMessage: null,
  faceMeshVisible: true,
  cameraEnabled: true,
  summaryData: null,
  alertFired: false,
  alertWindowStartMs: 0,
  mouthClockFilled: 0,
  noseClockFilled: 0,
  mouthClockSegments: 0,
  noseClockSegments: 0,
}

function modalKey(name: ModalName): keyof AppContextState {
  const map: Record<ModalName, keyof AppContextState> = {
    settings: 'showSettings',
    summary: 'showSummary',
    calibration: 'showCalibration',
    tutorial: 'showTutorial',
    onboarding: 'showOnboarding',
    auth: 'showAuthModal',
    limit: 'showLimitOverlay',
    alert: 'showAlertPopup',
  }
  return map[name]
}

function appReducer(state: AppContextState, action: AppAction): AppContextState {
  switch (action.type) {
    case 'SET_DETECTION_STATE':
      return { ...state, ...action.payload }
    case 'TICK_NOSE':
      return { ...state, noseSeconds: state.noseSeconds + 1 }
    case 'TICK_MOUTH':
      return { ...state, mouthSeconds: state.mouthSeconds + 1 }
    case 'SET_BASE_SECONDS':
      return { ...state, ...action.payload }
    case 'SET_THRESHOLD':
      return { ...state, threshold: action.payload }
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } }
    case 'SET_STATUS':
      return { ...state, statusText: action.payload }
    case 'SHOW_MODAL':
      return { ...state, [modalKey(action.payload)]: true }
    case 'HIDE_MODAL':
      return { ...state, [modalKey(action.payload)]: false }
    case 'SET_CAMERA_READY':
      return { ...state, cameraReady: action.payload }
    case 'SET_MEDIAPIPE_READY':
      return { ...state, mediapipeReady: action.payload }
    case 'SET_CAMERA_ENABLED':
      return { ...state, cameraEnabled: action.payload }
    case 'SET_FACE_MESH_VISIBLE':
      return { ...state, faceMeshVisible: action.payload }
    case 'SET_ALERT_STATE':
      return { ...state, ...action.payload }
    case 'SET_CLOCK_STATE':
      return { ...state, ...action.payload }
    case 'SET_TOAST':
      return { ...state, toastMessage: action.payload }
    case 'SET_SUMMARY_DATA':
      return { ...state, summaryData: action.payload }
    case 'RESET_DAY':
      return { ...state, noseSeconds: 0, mouthSeconds: 0, sessionStart: new Date().toISOString() }
    case 'SET_MINI_MODE':
      return { ...state, isMiniMode: action.payload }
    default:
      return state
  }
}

interface AppContextValue {
  state: AppContextState
  dispatch: Dispatch<AppAction>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
