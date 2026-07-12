import { useRef, useEffect, useState, type RefObject } from 'react'
import { useAppContext } from './store/AppContext'
import { useAuthContext } from './store/AuthContext'
import type { StoreSchema } from '../../types/session'
import { useCamera } from './hooks/useCamera'
import { useDetection } from './hooks/useDetection'
import { useCounters } from './hooks/useCounters'
import { useAlerts } from './hooks/useAlerts'
import { useCalibration } from './hooks/useCalibration'
import { useSettings } from './hooks/useSettings'
import { useSession } from './hooks/useSession'
import { useIpc } from './hooks/useIpc'
import { initMediaPipe } from './lib/mediapipe'

import { CameraSection } from './features/camera/CameraSection'
import { StateSection } from './features/detection/StateSection'
import { StatsSection } from './features/counters/StatsSection'
import { CalibrationModal } from './features/calibration/CalibrationModal'
import { SummaryModal } from './features/summary/SummaryModal'
import { SummaryLockOverlay } from './features/summary/SummaryLockOverlay'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { AuthModal } from './features/auth/AuthModal'
import { TutorialOverlay } from './features/tutorial/TutorialOverlay'
import { OnboardingOverlay } from './features/onboarding/OnboardingOverlay'
import { AlertPopup } from './features/alerts/AlertPopup'
import { LimitOverlay } from './features/limit/LimitOverlay'
import { MiniView } from './features/mini/MiniView'
import { TitleBar } from './components/TitleBar'
import { Toolbar } from './components/Toolbar'
import { Toast } from './components/Toast'

export default function App() {
  const { state, dispatch } = useAppContext()
  const { initAuth, isPro, user } = useAuthContext()

  const videoRef      = useRef<HTMLVideoElement>(null) as RefObject<HTMLVideoElement | null>
  const faceCanvasRef = useRef<HTMLCanvasElement>(null) as RefObject<HTMLCanvasElement | null>
  const noFaceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bootedRef    = useRef(false)
  const bootContinuedRef = useRef(false)
  const pendingBootSettingsRef = useRef<StoreSchema | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const { startCamera, toggleCamera } = useCamera(videoRef)
  const { resetAlertWindow, pauseAlertWindow } = useAlerts()
  const { calState, calibrationRefs, startCalibration, skipCalibration, resetCalibration } = useCalibration()
  const { loadSettings } = useSettings()
  const { restoreSession } = useSession()
  const { persistSession, resetLimitGate } = useCounters(pauseAlertWindow)

  useDetection(videoRef, faceCanvasRef, calibrationRefs)
  useIpc(persistSession, isPro)

  useEffect(() => {
    window.electronAPI.onMiniModeChanged((mini) => {
      dispatch({ type: 'SET_MINI_MODE', payload: mini })
    })
    return () => window.electronAPI.removeAllListeners('mini-mode-changed')
  }, [])

  const { showSettings, showSummary, showCalibration, showTutorial, showOnboarding, showAuthModal, showLimitOverlay, showSummaryLockOverlay } = state
  useEffect(() => {
    const anyOpen = showSettings || showSummary || showCalibration || showTutorial || showOnboarding || showAuthModal || showLimitOverlay || showSummaryLockOverlay
    window.electronAPI.setModalOpen(anyOpen)
  }, [showSettings, showSummary, showCalibration, showTutorial, showOnboarding, showAuthModal, showLimitOverlay, showSummaryLockOverlay])

  async function continueBootAfterAuth(settings: StoreSchema): Promise<void> {
    if (!settings.cameraPermission) {
      dispatch({ type: 'SHOW_MODAL', payload: 'onboarding' })
    } else {
      const cameraOk = await startCamera()
      if (!cameraOk) {
        await window.electronAPI.saveSettings({ cameraPermission: false })
        dispatch({ type: 'SHOW_MODAL', payload: 'onboarding' })
        return
      }
      dispatch({ type: 'SET_STATUS', payload: 'Loading detector…' })
      const detectorOk = await initMediaPipe()
      if (detectorOk) {
        dispatch({ type: 'SET_MEDIAPIPE_READY', payload: true })
        dispatch({ type: 'SET_STATUS', payload: 'Detecting…' })
        if (!settings.tutorialSeen) {
          dispatch({ type: 'SHOW_MODAL', payload: 'tutorial' })
        } else if (!settings.calibrated) {
          dispatch({ type: 'SHOW_MODAL', payload: 'calibration' })
        }
      } else {
        dispatch({ type: 'SET_STATUS', payload: 'Detector init failed' })
      }
    }
  }

  async function runContinueBootOnce(settings: StoreSchema): Promise<void> {
    if (bootContinuedRef.current) return
    bootContinuedRef.current = true
    await continueBootAfterAuth(settings)
  }

  // Single boot effect
  const bootRef = useRef(async () => {
    dispatch({ type: 'SET_STATUS', payload: 'Initializing…' })

    const settings = await loadSettings()

    const { isPro: isProStatus, signedIn } = await initAuth((isPro) => {
      // If user upgrades to Pro mid-session, clear the limit gate
      if (isPro) {
        resetLimitGate()
        dispatch({ type: 'HIDE_MODAL', payload: 'limit' })
        dispatch({ type: 'SET_DETECTION_STATE', payload: { mouthOpen: false, faceDetected: false, lipsOccluded: false, paused: false } })
      }
    })

    await restoreSession(isProStatus)
    setAuthChecked(true)

    // Google sign-in is required to enter the app at all. If there's no
    // restored session, show the (non-dismissible) sign-in modal and wait —
    // the effect below resumes boot once `user` actually becomes non-null.
    if (!signedIn) {
      pendingBootSettingsRef.current = settings
      dispatch({ type: 'SHOW_MODAL', payload: 'auth' })
      return
    }

    await runContinueBootOnce(settings)
  })

  // Resume boot the moment sign-in completes (covers both the initial gate
  // and a session that gets revoked/expires and is re-signed-in later)
  useEffect(() => {
    if (user && pendingBootSettingsRef.current) {
      dispatch({ type: 'HIDE_MODAL', payload: 'auth' })
      runContinueBootOnce(pendingBootSettingsRef.current)
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Run boot once (guard against Strict Mode double-invoke)
  const bootEffect = useRef(false)
  if (!bootEffect.current) {
    bootEffect.current = true
    // Defer so providers are fully mounted
    setTimeout(() => {
      if (!bootedRef.current) {
        bootedRef.current = true
        bootRef.current()
      }
    }, 0)
  }

  async function handleOnboardingAllow(): Promise<void> {
    const granted = await window.electronAPI.requestCameraPermission()
    if (granted !== 'granted') {
      dispatch({ type: 'SET_STATUS', payload: 'Camera permission denied' })
      return
    }
    const cameraOk = await startCamera()
    if (!cameraOk) return
    await window.electronAPI.saveSettings({ cameraPermission: true })
    dispatch({ type: 'SET_SETTINGS', payload: { cameraPermission: true } })
    dispatch({ type: 'SET_STATUS', payload: 'Loading detector…' })
    const detectorOk = await initMediaPipe()
    if (detectorOk) {
      dispatch({ type: 'SET_MEDIAPIPE_READY', payload: true })
      dispatch({ type: 'SET_STATUS', payload: 'Detecting…' })
      if (!state.settings.tutorialSeen) {
        dispatch({ type: 'SHOW_MODAL', payload: 'tutorial' })
      } else if (!state.settings.calibrated) {
        dispatch({ type: 'SHOW_MODAL', payload: 'calibration' })
      }
    }
  }

  function handleTutorialFinish(): void {
    if (!state.settings.calibrated) {
      dispatch({ type: 'SHOW_MODAL', payload: 'calibration' })
    }
  }

  function handleRecalibrate(): void {
    dispatch({ type: 'HIDE_MODAL', payload: 'settings' })
    resetCalibration()
    dispatch({ type: 'SHOW_MODAL', payload: 'calibration' })
  }

  async function handleSummaryClick(): Promise<void> {
    if (!isPro) {
      dispatch({ type: 'SHOW_MODAL', payload: 'summaryLocked' })
      return
    }
    await persistSession()
    const data = await window.electronAPI.getSummary()
    dispatch({ type: 'SET_SUMMARY_DATA', payload: data })
    dispatch({ type: 'SHOW_MODAL', payload: 'summary' })
  }

  function handleMinimize(): void {
    // Close any open modal/overlay first so mini mode always starts from the clean main view
    dispatch({ type: 'HIDE_MODAL', payload: 'settings' })
    dispatch({ type: 'HIDE_MODAL', payload: 'summary' })
    dispatch({ type: 'HIDE_MODAL', payload: 'auth' })
    dispatch({ type: 'HIDE_MODAL', payload: 'limit' })
    dispatch({ type: 'HIDE_MODAL', payload: 'summaryLocked' })
    dispatch({ type: 'HIDE_MODAL', payload: 'alert' })
    window.electronAPI.enterMiniMode()
  }

  function handleMinimizeToTaskbar(): void {
    window.electronAPI.minimizeWindow()
  }

  function handleToggleCamera(): void {
    toggleCamera(state.cameraEnabled, noFaceTimerRef)
  }

  function handleShowToast(msg: string): void {
    dispatch({ type: 'SET_TOAST', payload: msg })
  }

  // Google sign-in is required to enter the app. Until we've confirmed there's
  // no restored session, show nothing (avoids flashing the sign-in gate for
  // returning users while the session check is still in flight).
  if (!authChecked) {
    return (
      <>
        <TitleBar onMinimize={handleMinimizeToTaskbar} />
        <div id="status-bar">{state.statusText}</div>
      </>
    )
  }

  if (!user) {
    return (
      <>
        <TitleBar onMinimize={handleMinimizeToTaskbar} />
        <AuthModal />
      </>
    )
  }

  return (
    <>
      {state.isMiniMode && <MiniView />}
      <OnboardingOverlay onAllow={handleOnboardingAllow} />
      <TutorialOverlay onFinish={handleTutorialFinish} />
      <CalibrationModal
        calState={calState}
        calibrationRefs={calibrationRefs}
        onStart={startCalibration}
        onClose={() => {}}
        onSkip={skipCalibration}
      />
      <SummaryModal />
      <SummaryLockOverlay />
      <LimitOverlay />
      <AlertPopup onReset={resetAlertWindow} onShowToast={handleShowToast} />
      <SettingsPanel onRecalibrate={handleRecalibrate} />
      <Toast />
      {!state.isMiniMode && <TitleBar onMinimize={handleMinimize} />}
      <div id="app" className={state.isMiniMode ? 'app-mini-hidden' : undefined}>
        <Toolbar onSummaryClick={handleSummaryClick} />
        <CameraSection
          videoRef={videoRef}
          faceCanvasRef={faceCanvasRef}
          onToggleCamera={handleToggleCamera}
        />
        <StateSection />
        <StatsSection />
      </div>
    </>
  )
}
