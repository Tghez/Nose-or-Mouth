import './styles.css'
import { FaceLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { FaceLandmarkerResult, HandLandmarkerResult } from '@mediapipe/tasks-vision'
import type { AppState, CalibrationState } from '../../types/state'
import type { StoreSchema, SummaryData } from '../../types/session'
import { initAuth, signIn, signUp, signOut, syncSession, authState } from './auth'
import { isSupabaseConfigured } from './supabase'

const FREE_DAILY_LIMIT_SECONDS = 600 // 10 minutes for free tier
let limitReached = false

// ── Mouth alert tracking (rolling-window) ────────────────────────────────────
let alertEnabled = true
let alertWindowSeconds = 600
let alertProportionThreshold = 0.8
let alertWindowStartTime: number | null = null
let alertWindowMouthSeconds = 0
let alertWindowTotalSeconds = 0
let alertFired = false

// ── Camera state ──────────────────────────────────────────────────────────────
let activeStream: MediaStream | null = null
let cameraEnabled = true

// ── State ─────────────────────────────────────────────────────────────────────
const state: AppState = {
  mouthOpen: false,
  faceDetected: false,
  lipsOccluded: false,
  paused: true,
  noFaceTimer: null,
  noseSeconds: 0,
  mouthSeconds: 0,
  baseNoseSeconds: 0,
  baseMouthSeconds: 0,
  sessionStart: new Date().toISOString(),
  threshold: 0.2,
  cameraReady: false,
  mediapipeReady: false,
  settings: {}
}

// Rolling buffer for smoothing (3-frame average)
const ratioBuffer: number[] = []
const BUFFER_SIZE = 3

// ── DOM refs ──────────────────────────────────────────────────────────────────
const videoEl         = document.getElementById('video') as HTMLVideoElement
const faceCanvas      = document.getElementById('face-canvas') as HTMLCanvasElement
const faceCtx         = faceCanvas.getContext('2d')!
const cameraWrap      = document.getElementById('camera-wrap') as HTMLDivElement
const faceBadge       = document.getElementById('face-badge') as HTMLDivElement
const statusDot       = document.getElementById('status-dot') as HTMLDivElement
const stateIndicator  = document.getElementById('state-indicator') as HTMLDivElement
const stateEmoji      = document.getElementById('state-emoji') as HTMLDivElement
const stateLabel      = document.getElementById('state-label') as HTMLDivElement
const noseTimeEl      = document.getElementById('nose-time') as HTMLDivElement
const mouthTimeEl     = document.getElementById('mouth-time') as HTMLDivElement
const ratioFill       = document.getElementById('ratio-fill') as HTMLDivElement
const nosePctLabel    = document.getElementById('nose-pct-label') as HTMLSpanElement
const mouthPctLabel   = document.getElementById('mouth-pct-label') as HTMLSpanElement
const statusBar       = document.getElementById('status-bar') as HTMLDivElement
const onboardingEl    = document.getElementById('onboarding') as HTMLDivElement
const calibrationEl   = document.getElementById('calibration-modal') as HTMLDivElement
const summaryEl       = document.getElementById('summary-modal') as HTMLDivElement
const settingsPanel   = document.getElementById('settings-panel') as HTMLDivElement
const authModal       = document.getElementById('auth-modal') as HTMLDivElement
const limitOverlay    = document.getElementById('limit-overlay') as HTMLDivElement

// ── Toolbar + alert popup DOM refs ────────────────────────────────────────────
const cameraToggleInput    = document.getElementById('camera-toggle') as HTMLInputElement
const toolbarAlertBtn      = document.getElementById('tb-alert') as HTMLButtonElement
const cameraOffPlaceholder = document.getElementById('camera-off-placeholder') as HTMLDivElement
const alertBackdrop        = document.getElementById('alert-backdrop') as HTMLDivElement
const alertPopup           = document.getElementById('alert-popup') as HTMLDivElement
const alertEnabledToggle   = document.getElementById('alert-enabled-toggle') as HTMLInputElement
const alertWindowSelect    = document.getElementById('alert-window-select') as HTMLSelectElement
const alertThresholdSelect  = document.getElementById('alert-threshold-select') as HTMLInputElement
const alertThresholdDisplay = document.getElementById('alert-threshold-display') as HTMLSpanElement
const alertControlsEl      = document.getElementById('alert-controls') as HTMLDivElement
const alertWindowCounterEl = document.getElementById('alert-window-counter') as HTMLSpanElement

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatTime(totalSeconds: number): string {
  const s = Math.floor(totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':')
}

// ── MediaPipe FaceLandmarker ──────────────────────────────────────────────────

let faceLandmarker: FaceLandmarker | null = null
let handLandmarker: HandLandmarker | null = null
let lastSendTime = 0

async function initMediaPipe(): Promise<boolean> {
  setStatus('Loading detector…')
  try {
    const vision = await FilesetResolver.forVisionTasks('./mediapipe-wasm')
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: './mediapipe-wasm/face_landmarker.task',
        delegate: 'CPU',
      },
      outputFaceBlendshapes: false,
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.2,
      minFacePresenceScore: 0.2,
      minTrackingConfidence: 0.2,
    })
    try {
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: './mediapipe-wasm/hand_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceScore: 0.5,
        minTrackingConfidence: 0.5,
      })
    } catch (handErr) {
      console.warn('HandLandmarker init failed — lip occlusion detection disabled:', handErr)
    }
  } catch (err) {
    console.error('FaceLandmarker init error:', err)
    setStatus('Detector init failed')
    return false
  }

  state.mediapipeReady = true
  initMeshFeatures()
  setStatus('Detecting…')
  startDetectionLoop()
  return true
}

function startDetectionLoop(): void {
  function loop(): void {
    requestAnimationFrame(loop)
    if (!state.cameraReady || !state.mediapipeReady || !faceLandmarker) return
    const now = Date.now()
    if (now - lastSendTime >= 200) {
      lastSendTime = now
      if (videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        try {
          const ts = performance.now()
          const faceResults = faceLandmarker.detectForVideo(videoEl, ts)
          const handResults = handLandmarker?.detectForVideo(videoEl, ts) ?? null
          onFaceLandmarkerResults(faceResults, handResults)
        } catch (err) {
          console.error('detectForVideo error:', err)
        }
      }
    }
  }
  loop()
}

// Lip-openness ratio: sensitive to partial openings, robust to yaw.
//
// WHY 2D eye-dist breaks at yaw: when the face turns sideways one eye moves
// behind the other in projection, so eyeDist_2D → 0 and the ratio spikes even
// with a closed mouth.
//
// WHY the 3-pair face-height approach broke half-open detection: averaging side
// pairs (82/87, 312/317) with the center pair (13/14) dilutes the signal —
// side pairs travel less vertically than center on a partial opening, and the
// face-height denominator is so large that partial openings produce ratios too
// small to distinguish from closed.
//
// Solution: center pair only (maximum sensitivity) + 3D inter-eye distance
// (yaw-stable: when the face turns, x-collapse is compensated by z-depth).
//   13 = upper inner lip center, 14 = lower inner lip center
//   33 = left eye medial canthus, 263 = right eye medial canthus
function getLipOpenRatio(results: FaceLandmarkerResult): number {
  const lm = results.faceLandmarks?.[0]
  if (!lm) return 0

  const d3 = (a: number, b: number) =>
    Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y, (lm[a].z ?? 0) - (lm[b].z ?? 0))

  const lipGap = d3(13, 14)
  const eyeDist = d3(33, 263)   // 3D: stays constant across yaw rotations

  return eyeDist > 0 ? lipGap / eyeDist : 0
}

function classifyMouth(ratio: number): boolean {
  ratioBuffer.push(ratio)
  if (ratioBuffer.length > BUFFER_SIZE) ratioBuffer.shift()
  const avg = ratioBuffer.reduce((a, b) => a + b, 0) / ratioBuffer.length
  return avg > state.threshold
}

function isLipsOccluded(
  lm: FaceLandmarkerResult['faceLandmarks'][0],
  handResults: HandLandmarkerResult
): boolean {
  if (!handResults.landmarks || handResults.landmarks.length === 0) return false

  // Both mouth corners must be covered — ensures the hand spans the full mouth width.
  // A hand near the center or touching one side won't trigger this.
  const eyeDist = Math.hypot(lm[33].x - lm[263].x, lm[33].y - lm[263].y)
  const r = eyeDist * 0.35

  for (const handLms of handResults.landmarks) {
    let leftCovered = false
    let rightCovered = false
    for (const p of handLms) {
      if (Math.hypot(p.x - lm[61].x, p.y - lm[61].y) < r) leftCovered = true
      if (Math.hypot(p.x - lm[291].x, p.y - lm[291].y) < r) rightCovered = true
    }
    if (leftCovered && rightCovered) return true
  }
  return false
}

function onFaceLandmarkerResults(
  results: FaceLandmarkerResult,
  handResults: HandLandmarkerResult | null
): void {
  if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
    clearFaceMesh()
    handleNoFace()
    return
  }
  handleFaceDetected()
  drawFaceMesh(results)

  const lm = results.faceLandmarks[0]
  if (handResults && isLipsOccluded(lm, handResults)) {
    if (!state.lipsOccluded) ratioBuffer.length = 0
    state.lipsOccluded = true
    setStateWaiting()
    setStatus('Lips covered — waiting')
    window.electronAPI.updateTrayIcon('none')
    return
  }
  if (state.lipsOccluded) ratioBuffer.length = 0
  state.lipsOccluded = false

  const ratio = getLipOpenRatio(results)
  state.mouthOpen = classifyMouth(ratio)
  updateStateUI()

  if (calibrationState.active) {
    const el = document.getElementById('calibration-ratio-display')
    if (el) el.textContent = ratio.toFixed(4)
    if (calibrationState.collecting) calibrationState.samples.push(ratio)
  }
}

type Connection = { start: number; end: number }

let faceMeshVisible = true

const MESH_FEATURES: Array<Connection[]> = [] // populated after FaceLandmarker is loaded

function initMeshFeatures(): void {
  MESH_FEATURES.push(
    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    FaceLandmarker.FACE_LANDMARKS_LIPS,
  )
}

function drawFaceMesh(results: FaceLandmarkerResult): void {
  if (!faceMeshVisible) return

  const cw = faceCanvas.width
  const ch = faceCanvas.height
  faceCtx.clearRect(0, 0, cw, ch)

  const landmarks = results.faceLandmarks[0]

  // Map normalized coords to canvas pixels, accounting for object-fit: cover
  const vw = videoEl.videoWidth  || cw
  const vh = videoEl.videoHeight || ch
  const scale = Math.max(cw / vw, ch / vh)
  const ox = (cw - vw * scale) / 2
  const oy = (ch - vh * scale) / 2

  const px = (i: number) => landmarks[i].x * vw * scale + ox
  const py = (i: number) => landmarks[i].y * vh * scale + oy

  for (const conns of MESH_FEATURES) {
    faceCtx.strokeStyle = 'rgba(251,191,36,0.28)'
    faceCtx.lineWidth = 0.8
    faceCtx.beginPath()
    for (const c of conns) {
      faceCtx.moveTo(px(c.start), py(c.start))
      faceCtx.lineTo(px(c.end),   py(c.end))
    }
    faceCtx.stroke()

    faceCtx.fillStyle = 'rgba(251,191,36,0.60)'
    const seen = new Set<number>()
    for (const c of conns) {
      for (const idx of [c.start, c.end]) {
        if (!seen.has(idx)) {
          seen.add(idx)
          faceCtx.beginPath()
          faceCtx.arc(px(idx), py(idx), 1.5, 0, Math.PI * 2)
          faceCtx.fill()
        }
      }
    }
  }
}

function clearFaceMesh(): void {
  faceCtx.clearRect(0, 0, faceCanvas.width, faceCanvas.height)
}

function handleNoFace(): void {
  updateStatusDot('no-face')
  updateFaceBadge(false)
  if (state.faceDetected) {
    state.faceDetected = false
    setStateWaiting()
    if (!state.noFaceTimer) {
      state.noFaceTimer = setTimeout(() => {
        state.paused = true
        state.noFaceTimer = null
        setStateNone()
        setStatus('No face detected — paused')
        window.electronAPI.updateTrayIcon('none')
      }, 10000)
    }
  }
}

function handleFaceDetected(): void {
  if (state.noFaceTimer) {
    clearTimeout(state.noFaceTimer)
    state.noFaceTimer = null
  }
  state.faceDetected = true
  state.paused = false
  updateStatusDot('detecting')
  updateFaceBadge(true)
  setStatus('Detecting…')
}

function updateFaceBadge(detected: boolean): void {
  if (detected) {
    faceBadge.textContent = ''
    faceBadge.className = ''
    cameraWrap.classList.add('face-ok')
    cameraWrap.classList.remove('face-missing')
  } else {
    faceBadge.textContent = '● No Face detected'
    faceBadge.className = 'face-missing'
    cameraWrap.classList.remove('face-ok')
  }
}

// ── UI updates ────────────────────────────────────────────────────────────────

function updateStateUI(): void {
  if (state.mouthOpen) {
    stateIndicator.className = 'state-mouth'
    stateEmoji.textContent = '👄'
    stateLabel.textContent = 'MOUTH'
    window.electronAPI.updateTrayIcon('mouth')
  } else {
    stateIndicator.className = 'state-nose'
    stateEmoji.textContent = '👃'
    stateLabel.textContent = 'NOSE'
    window.electronAPI.updateTrayIcon('nose')
  }
}

function setStateNone(): void {
  stateIndicator.className = 'state-none'
  stateEmoji.textContent = '👃'
  stateLabel.textContent = 'PAUSED'
}

function setStateWaiting(): void {
  stateIndicator.className = 'state-none'
  stateEmoji.textContent = '👃'
  stateLabel.textContent = 'WAITING'
}

function updateStatusDot(mode: string): void {
  statusDot.className = mode
}

function setStatus(text: string): void {
  statusBar.textContent = text
}

function updateCounterUI(): void {
  noseTimeEl.textContent  = formatTime(state.noseSeconds)
  mouthTimeEl.textContent = formatTime(state.mouthSeconds)

  const total = state.noseSeconds + state.mouthSeconds
  if (total > 0) {
    const nosePct  = Math.round((state.noseSeconds / total) * 100)
    const mouthPct = 100 - nosePct
    ratioFill.style.width = nosePct + '%'
    nosePctLabel.textContent  = nosePct  + '% nose'
    mouthPctLabel.textContent = mouthPct + '% mouth'
  }
}

// ── Counter tick ──────────────────────────────────────────────────────────────

let saveDebounceCount = 0

setInterval(() => {
  if (state.paused || !state.faceDetected || state.lipsOccluded) {
    alertWindowStartTime = null
    alertWindowMouthSeconds = 0
    alertWindowTotalSeconds = 0
    return
  }

  if (state.mouthOpen) {
    state.mouthSeconds++
  } else {
    state.noseSeconds++
  }

  // ── Rolling-window alert logic ────────────────────────────────────────────
  if (alertEnabled) {
    if (alertWindowStartTime === null) {
      alertWindowStartTime = Date.now()
      alertWindowMouthSeconds = 0
      alertWindowTotalSeconds = 0
    }
    alertWindowTotalSeconds++
    if (state.mouthOpen) alertWindowMouthSeconds++

    const elapsed = (Date.now() - alertWindowStartTime) / 1000
    if (elapsed >= alertWindowSeconds) {
      const proportion = alertWindowTotalSeconds > 0
        ? alertWindowMouthSeconds / alertWindowTotalSeconds : 0
      if (proportion >= alertProportionThreshold && !alertFired) {
        alertFired = true
        const pct = Math.round(proportion * 100)
        const winMins = alertWindowSeconds / 60
        window.electronAPI.showNotification({
          title: 'Mouth Breather Alert',
          body: `${pct}% mouth breathing in the last ${winMins} min — try nose breathing!`
        })
        updateAlertBtnStyle()
      }
      alertWindowStartTime = Date.now()
      alertWindowMouthSeconds = 0
      alertWindowTotalSeconds = 0
      alertFired = false
    }
    updateAlertCounter()
  }
  // ── End alert logic ───────────────────────────────────────────────────────

  updateCounterUI()

  // Free-tier daily limit gate
  if (!limitReached && !authState.isPro) {
    const totalToday = state.baseNoseSeconds + state.baseMouthSeconds +
                       state.noseSeconds     + state.mouthSeconds
    if (totalToday >= FREE_DAILY_LIMIT_SECONDS) {
      limitReached = true
      state.paused = true
      persistSession()
      showLimitOverlay()
      return
    }
  }

  saveDebounceCount++
  if (saveDebounceCount >= 30) {
    saveDebounceCount = 0
    persistSession()
  }
}, 1000)

async function persistSession(): Promise<void> {
  const payload = {
    date: todayString(),
    sessionStart: state.sessionStart,
    mouthBreathingSeconds: state.baseMouthSeconds + state.mouthSeconds,
    noseBreathingSeconds:  state.baseNoseSeconds  + state.noseSeconds
  }
  await window.electronAPI.saveSession(payload)
  syncSession(payload).catch(() => {})
}

function showLimitOverlay(): void {
  limitOverlay.classList.remove('hidden')
}

function hideLimitOverlay(): void {
  limitOverlay.classList.add('hidden')
}

// ── Camera ────────────────────────────────────────────────────────────────────

async function startCamera(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 960 },
        facingMode: { ideal: 'user' },
      }
    })
    activeStream = stream
    videoEl.srcObject = stream

    await new Promise<void>((resolve, reject) => {
      videoEl.onloadedmetadata = () => {
        videoEl.play().then(resolve).catch(reject)
      }
      videoEl.onerror = reject
    })

    // On macOS, videoWidth can stay 0 briefly after play() resolves while the
    // first frame is decoded. Poll until a real frame is available (max 3s).
    if (videoEl.videoWidth === 0) {
      await new Promise<void>((resolve) => {
        let attempts = 0
        const check = () => {
          if (videoEl.videoWidth > 0 || attempts++ > 30) resolve()
          else setTimeout(check, 100)
        }
        check()
      })
    }

    state.cameraReady = true
    return true
  } catch (err) {
    setStatus('Camera unavailable: ' + (err as Error).message)
    updateStatusDot('')
    return false
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function loadSettings(): Promise<StoreSchema> {
  const s = await window.electronAPI.getSettings()
  state.settings = s

  // Threshold migration history:
  //   ≥ 0.2        → old blendshape scale (0–1): stale
  //   < 0.04       → set by the short-lived face-height metric (values ~3× smaller
  //                  than the eye-dist scale): stale, recalibrate
  //   0.04 – 0.19  → calibrated against 2D or 3D inter-eye distance: valid,
  //                  3D scale matches 2D scale when frontal so no migration needed
  const stored = s.threshold ?? 0.07
  const isStale = stored >= 0.2 || stored < 0.04
  if (isStale) await window.electronAPI.saveSettings({ calibrated: false, threshold: 0.07 })
  const effective = isStale ? 0.07 : stored
  state.threshold = effective

  const lightMode = !!s.lightMode
  document.body.classList.toggle('light', lightMode)
  ;(document.getElementById('setting-light-mode') as HTMLInputElement).checked = lightMode

  ;(document.getElementById('setting-always-on-top') as HTMLInputElement).checked = !!s.alwaysOnTop
  ;(document.getElementById('setting-start-at-login') as HTMLInputElement).checked = !!s.startAtLogin
  ;(document.getElementById('setting-summary-time') as HTMLInputElement).value = s.summaryTime ?? '18:00'
  const thresholdEl = document.getElementById('setting-threshold') as HTMLInputElement
  thresholdEl.value = String(effective)
  ;(document.getElementById('threshold-display') as HTMLSpanElement).textContent =
    parseFloat(thresholdEl.value).toFixed(3)

  alertEnabled = s.alertEnabled ?? true
  alertWindowSeconds = s.alertWindowSeconds ?? 600
  alertProportionThreshold = s.alertProportionThreshold ?? 0.8
  alertEnabledToggle.checked = alertEnabled
  alertWindowSelect.value = String(alertWindowSeconds)
  alertThresholdSelect.value = String(Math.round(alertProportionThreshold * 100))
  alertThresholdDisplay.textContent = Math.round(alertProportionThreshold * 100) + '%'
  alertControlsEl.classList.toggle('disabled', !alertEnabled)

  return s
}

function bindSettingsEvents(): void {
  const lightModeEl      = document.getElementById('setting-light-mode') as HTMLInputElement
  const alwaysOnTopEl    = document.getElementById('setting-always-on-top') as HTMLInputElement
  const startAtLoginEl   = document.getElementById('setting-start-at-login') as HTMLInputElement
  const summaryTimeEl    = document.getElementById('setting-summary-time') as HTMLInputElement
  const thresholdEl      = document.getElementById('setting-threshold') as HTMLInputElement
  const thresholdDisplay = document.getElementById('threshold-display') as HTMLSpanElement

  lightModeEl.addEventListener('change', () => {
    const isLight = lightModeEl.checked
    document.body.classList.toggle('light', isLight)
    window.electronAPI.saveSettings({ lightMode: isLight })
  })

  alwaysOnTopEl.addEventListener('change', () => {
    window.electronAPI.saveSettings({ alwaysOnTop: alwaysOnTopEl.checked })
  })

  startAtLoginEl.addEventListener('change', () => {
    window.electronAPI.saveSettings({ startAtLogin: startAtLoginEl.checked })
  })

  summaryTimeEl.addEventListener('change', () => {
    window.electronAPI.saveSettings({ summaryTime: summaryTimeEl.value })
  })

  thresholdEl.addEventListener('input', () => {
    const val = parseFloat(thresholdEl.value)
    thresholdDisplay.textContent = val.toFixed(3)
    state.threshold = val
    window.electronAPI.saveSettings({ threshold: val })
  })

  const overlayToggleInput = document.getElementById('overlay-toggle') as HTMLInputElement
  overlayToggleInput.addEventListener('change', () => {
    faceMeshVisible = overlayToggleInput.checked
    if (!faceMeshVisible) clearFaceMesh()
  })

  document.getElementById('settings-close-btn')!.addEventListener('click', () => {
    settingsPanel.classList.add('hidden')
  })

  document.getElementById('recalibrate-btn')!.addEventListener('click', () => {
    settingsPanel.classList.add('hidden')
    showCalibration()
  })

  window.electronAPI.onSettingsChanged((newSettings) => {
    state.settings = newSettings
    state.threshold = newSettings.threshold ?? 0.2
    alertEnabled = newSettings.alertEnabled ?? true
    alertWindowSeconds = newSettings.alertWindowSeconds ?? 600
    alertProportionThreshold = newSettings.alertProportionThreshold ?? 0.8
    const isLight = !!newSettings.lightMode
    document.body.classList.toggle('light', isLight)
    lightModeEl.checked    = isLight
    alwaysOnTopEl.checked  = !!newSettings.alwaysOnTop
    startAtLoginEl.checked = !!newSettings.startAtLogin
    alertEnabledToggle.checked = alertEnabled
    alertWindowSelect.value = String(alertWindowSeconds)
    alertThresholdSelect.value = String(Math.round(alertProportionThreshold * 100))
    alertThresholdDisplay.textContent = Math.round(alertProportionThreshold * 100) + '%'
    alertControlsEl.classList.toggle('disabled', !alertEnabled)
  })
}

// ── Tutorial ──────────────────────────────────────────────────────────────────

interface TutorialStep {
  icon: string
  title: string
  body: string
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    icon: '📹',
    title: 'Camera Feed',
    body: 'Your webcam is analyzed in real time. No video is recorded or sent anywhere — all processing stays on your device.'
  },
  {
    icon: '👃',
    title: 'Breathing State',
    body: 'The center shows your current state: NOSE (green) is great! MOUTH (amber) means try to breathe through your nose instead.'
  },
  {
    icon: '⏱️',
    title: 'Daily Timers',
    body: 'These track how long you breathe through your nose vs mouth today. The bar shows the ratio at a glance.'
  },
  {
    icon: '⚙️',
    title: 'Settings & Summary',
    body: "Use the toolbar at the top to adjust settings, view your daily summary, configure alerts, and toggle the camera."
  }
]

let tutorialStepIndex = 0

function renderTutorialStep(): void {
  const step = TUTORIAL_STEPS[tutorialStepIndex]
  document.getElementById('tutorial-icon')!.textContent = step.icon
  document.getElementById('tutorial-title')!.textContent = step.title
  document.getElementById('tutorial-body')!.textContent = step.body

  document.querySelectorAll('.tut-dot').forEach((dot, i) => {
    dot.className = 'tut-dot' + (i === tutorialStepIndex ? ' active' : '')
  })

  const nextBtn = document.getElementById('tutorial-next-btn') as HTMLButtonElement
  nextBtn.textContent = tutorialStepIndex === TUTORIAL_STEPS.length - 1 ? 'Done ✓' : 'Next →'
}

function finishTutorial(): void {
  document.getElementById('tutorial-overlay')!.classList.add('hidden')
  window.electronAPI.saveSettings({ tutorialSeen: true })
  if (!state.settings.calibrated) showCalibration()
}

function initTutorial(): void {
  document.getElementById('tutorial-next-btn')!.addEventListener('click', () => {
    tutorialStepIndex++
    if (tutorialStepIndex >= TUTORIAL_STEPS.length) {
      finishTutorial()
    } else {
      renderTutorialStep()
    }
  })

  document.getElementById('tutorial-skip-btn')!.addEventListener('click', () => {
    finishTutorial()
  })
}

function showTutorial(): void {
  tutorialStepIndex = 0
  renderTutorialStep()
  document.getElementById('tutorial-overlay')!.classList.remove('hidden')
}

// ── Onboarding ────────────────────────────────────────────────────────────────

function showOnboarding(): void {
  onboardingEl.classList.remove('hidden')

  document.getElementById('ob-allow-btn')!.addEventListener('click', async () => {
    onboardingEl.classList.add('hidden')
    const granted = await window.electronAPI.requestCameraPermission()
    if (granted === 'granted') {
      const cameraOk = await startCamera()
      if (cameraOk) {
        await window.electronAPI.saveSettings({ cameraPermission: true })
        const detectorOk = await initMediaPipe()
        if (detectorOk) {
          if (!state.settings.tutorialSeen) {
            showTutorial()
          } else if (!state.settings.calibrated) {
            showCalibration()
          }
        }
      }
    } else {
      setStatus('Camera permission denied')
    }
  }, { once: true })

  document.getElementById('ob-skip-btn')!.addEventListener('click', () => {
    onboardingEl.classList.add('hidden')
    setStatus('Camera not enabled — use Settings to set up')
  }, { once: true })
}

// ── Calibration ───────────────────────────────────────────────────────────────

const calibrationState: CalibrationState = {
  active: false,
  collecting: false,
  samples: [],
  step: 0
}

function showCalibration(): void {
  calibrationEl.classList.remove('hidden')
  calibrationState.active = true
  calibrationState.step = 0
  calibrationState.samples = []

  updateCalDots(0)
  document.getElementById('calibration-step-label')!.textContent = 'Press Start to begin'
  document.getElementById('calibration-ratio-display')!.textContent = '—'
}

function updateCalDots(step: number): void {
  for (let i = 0; i < 3; i++) {
    const dot = document.getElementById(`cal-dot-${i}`)!
    dot.className = 'cal-dot' + (i < step ? ' done' : '') + (i === step ? ' active' : '')
  }
}

document.getElementById('cal-start-btn')!.addEventListener('click', () => {
  if (calibrationState.step === 0) {
    runCalStep1()
  }
})

document.getElementById('cal-skip-btn')!.addEventListener('click', () => {
  calibrationEl.classList.add('hidden')
  calibrationState.active = false
  window.electronAPI.saveSettings({ calibrated: true })
})

async function runCalStep1(): Promise<void> {
  const btn   = document.getElementById('cal-start-btn') as HTMLButtonElement
  const label = document.getElementById('calibration-step-label')!

  calibrationState.step = 1
  updateCalDots(1)
  label.textContent = 'Keep your mouth CLOSED naturally (3 sec)…'
  btn.disabled = true
  calibrationState.samples = []
  calibrationState.collecting = true

  await sleep(3000)
  calibrationState.collecting = false
  const closedAvg = avg(calibrationState.samples)

  calibrationState.step = 2
  updateCalDots(2)
  label.textContent = 'Now open your mouth wide (3 sec)…'
  calibrationState.samples = []
  calibrationState.collecting = true

  await sleep(3000)
  calibrationState.collecting = false
  const openAvg = avg(calibrationState.samples)

  const threshold = parseFloat((closedAvg + (openAvg - closedAvg) * 0.25).toFixed(4))
  const clamped   = Math.min(Math.max(threshold, 0.01), 0.95)

  state.threshold = clamped
  ;(document.getElementById('setting-threshold') as HTMLInputElement).value = String(clamped)
  ;(document.getElementById('threshold-display') as HTMLSpanElement).textContent = clamped.toFixed(3)
  await window.electronAPI.saveSettings({ threshold: clamped, calibrated: true })

  calibrationState.active = false
  calibrationState.step = -1
  updateCalDots(3)
  label.textContent = `Done! Threshold set to ${clamped.toFixed(4)}`
  btn.textContent = 'Close'
  btn.disabled = false

  btn.addEventListener('click', () => {
    calibrationEl.classList.add('hidden')
    btn.textContent = 'Start Calibration'
  }, { once: true })
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }
function avg(arr: number[]): number { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0 }

// ── Daily Summary ─────────────────────────────────────────────────────────────

window.electronAPI.onDailySummaryTrigger(async (data) => {
  persistSession()

  await window.electronAPI.showNotification({
    title: 'Mouth Breather Daily Summary',
    body: buildSummaryBody(data)
  })

  showSummaryModal(data)

  state.noseSeconds  = 0
  state.mouthSeconds = 0
  state.sessionStart = new Date().toISOString()
  updateCounterUI()
})

function buildSummaryBody({ noseSeconds, mouthSeconds }: Pick<SummaryData, 'noseSeconds' | 'mouthSeconds'>): string {
  const total = noseSeconds + mouthSeconds
  if (total === 0) return 'No data recorded today.'
  const nosePct = Math.round((noseSeconds / total) * 100)
  return nosePct >= 80
    ? `Great day! ${nosePct}% nose breathing 👃`
    : `${nosePct}% nose / ${100 - nosePct}% mouth — keep it up!`
}

function showSummaryModal(data: SummaryData): void {
  const { date, noseSeconds, mouthSeconds, streak } = data
  const total    = noseSeconds + mouthSeconds
  const nosePct  = total > 0 ? Math.round((noseSeconds / total) * 100) : 0
  const mouthPct = 100 - nosePct

  document.getElementById('summary-date')!.textContent = date
  document.getElementById('summary-total')!.textContent = `Total tracked: ${formatTime(total)}`
  document.getElementById('legend-nose-pct')!.textContent  = nosePct  + '% Nose'
  document.getElementById('legend-mouth-pct')!.textContent = mouthPct + '% Mouth'

  const streakEl = document.getElementById('summary-streak')!
  streakEl.textContent = streak > 0
    ? `🔥 ${streak} day${streak !== 1 ? 's' : ''} in a row with <20% mouth breathing`
    : ''

  const msgEl = document.getElementById('summary-message')!
  if (nosePct >= 80) {
    msgEl.textContent = 'Great day! 🎉'
    msgEl.className = ''
  } else {
    msgEl.textContent = 'Room to improve 💪'
    msgEl.className = 'warn'
  }

  drawDonut(document.getElementById('donut-chart') as HTMLCanvasElement, nosePct, mouthPct)
  summaryEl.classList.remove('hidden')
}

document.getElementById('summary-close-btn')!.addEventListener('click', () => {
  summaryEl.classList.add('hidden')
})

function drawDonut(canvas: HTMLCanvasElement, nosePct: number, mouthPct: number): void {
  const ctx  = canvas.getContext('2d')!
  const size = canvas.width
  const cx   = size / 2
  const cy   = size / 2
  const r    = size * 0.38
  const lw   = size * 0.14
  const TAU  = Math.PI * 2
  const start = -Math.PI / 2
  const noseFrac = nosePct / 100

  const cs = getComputedStyle(document.body)
  const surface2 = cs.getPropertyValue('--surface2').trim() || '#1e1e1e'
  const textColor = cs.getPropertyValue('--text').trim() || '#e5e5e5'
  const textDim   = cs.getPropertyValue('--text-dim').trim() || '#6b7280'

  ctx.clearRect(0, 0, size, size)

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.strokeStyle = surface2
  ctx.lineWidth = lw
  ctx.stroke()

  if (mouthPct > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, start + noseFrac * TAU, start + TAU)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = lw
    ctx.lineCap = 'butt'
    ctx.stroke()
  }

  if (nosePct > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, start, start + noseFrac * TAU)
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = lw
    ctx.lineCap = 'butt'
    ctx.stroke()
  }

  ctx.fillStyle = textColor
  ctx.font = `bold ${Math.round(size * 0.17)}px system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${nosePct}%`, cx, cy - size * 0.05)
  ctx.font = `${Math.round(size * 0.09)}px system-ui`
  ctx.fillStyle = textDim
  ctx.fillText('nose', cx, cy + size * 0.1)
}

// ── Auth UI ───────────────────────────────────────────────────────────────

function updateAuthButton(): void {
  const accountGroup = document.getElementById('settings-account') as HTMLDivElement
  const accountOut   = document.getElementById('settings-account-out') as HTMLDivElement
  const accountIn    = document.getElementById('settings-account-in') as HTMLDivElement
  const emailEl      = document.getElementById('settings-account-email') as HTMLSpanElement
  const planEl       = document.getElementById('settings-account-plan') as HTMLElement
  if (!isSupabaseConfigured) { accountGroup.style.display = 'none'; return }
  if (authState.user) {
    accountOut.classList.add('hidden')
    accountIn.classList.remove('hidden')
    emailEl.textContent = authState.user.email ?? ''
    planEl.textContent  = authState.isPro ? 'Pro — cloud sync enabled' : 'Free plan'
  } else {
    accountOut.classList.remove('hidden')
    accountIn.classList.add('hidden')
  }
}

function openAuthModal(): void {
  const signedOut = document.getElementById('auth-signedout')!
  const signedIn  = document.getElementById('auth-signedin')!

  if (authState.user) {
    signedOut.classList.add('hidden')
    signedIn.classList.remove('hidden')
    document.getElementById('auth-user-email')!.textContent = authState.user.email ?? ''
    const badge = document.getElementById('auth-plan-badge')!
    if (authState.isPro) {
      badge.textContent = 'Pro'
      badge.className = 'pro'
    } else {
      badge.textContent = 'Free'
      badge.className = ''
    }
  } else {
    signedOut.classList.remove('hidden')
    signedIn.classList.add('hidden')
  }

  authModal.classList.remove('hidden')
}

function initAuthUI(): void {
  // Limit overlay buttons must work regardless of Supabase config
  document.getElementById('limit-dismiss-btn')!.addEventListener('click', hideLimitOverlay)
  document.getElementById('limit-upgrade-btn')!.addEventListener('click', () => {
    hideLimitOverlay()
    if (isSupabaseConfigured && !authState.user) {
      openAuthModal()
    } else {
      setStatus('Pro subscriptions coming soon!')
    }
  })

  if (!isSupabaseConfigured) return

  document.getElementById('settings-signin-btn')!.addEventListener('click', () => {
    settingsPanel.classList.add('hidden')
    openAuthModal()
  })

  document.getElementById('settings-signout-btn')!.addEventListener('click', async () => {
    await signOut()
    updateAuthButton()
  })

  const closeBtn   = document.getElementById('auth-close-btn')!
  const submitBtn  = document.getElementById('auth-submit-btn') as HTMLButtonElement
  const signoutBtn = document.getElementById('auth-signout-btn')!
  const tabSignIn  = document.getElementById('tab-signin')!
  const tabSignUp  = document.getElementById('tab-signup')!
  const emailEl    = document.getElementById('auth-email') as HTMLInputElement
  const passEl     = document.getElementById('auth-password') as HTMLInputElement
  const errorEl    = document.getElementById('auth-error')!

  let isSignUp = false

  function setTab(signup: boolean): void {
    isSignUp = signup
    tabSignIn.classList.toggle('active', !signup)
    tabSignUp.classList.toggle('active',  signup)
    submitBtn.textContent = signup ? 'Create Account' : 'Sign In'
    errorEl.classList.add('hidden')
  }

  tabSignIn.addEventListener('click', () => setTab(false))
  tabSignUp.addEventListener('click', () => setTab(true))

  submitBtn.addEventListener('click', async () => {
    const email = emailEl.value.trim()
    const pass  = passEl.value
    if (!email || !pass) return

    submitBtn.disabled = true
    submitBtn.textContent = isSignUp ? 'Creating…' : 'Signing in…'
    errorEl.classList.add('hidden')

    const err = isSignUp ? await signUp(email, pass) : await signIn(email, pass)

    if (err) {
      errorEl.textContent = err
      errorEl.classList.remove('hidden')
      submitBtn.disabled = false
      submitBtn.textContent = isSignUp ? 'Create Account' : 'Sign In'
    } else {
      if (isSignUp) {
        errorEl.textContent = 'Check your email to confirm your account.'
        errorEl.style.color = 'var(--nose-color)'
        errorEl.classList.remove('hidden')
      } else {
        authModal.classList.add('hidden')
      }
      submitBtn.disabled = false
      submitBtn.textContent = isSignUp ? 'Create Account' : 'Sign In'
    }
  })

  signoutBtn.addEventListener('click', async () => {
    await signOut()
    authModal.classList.add('hidden')
  })

  closeBtn.addEventListener('click', () => authModal.classList.add('hidden'))
}

// ── Restore today's session ───────────────────────────────────────────────────

async function restoreSession(): Promise<void> {
  const sess = await window.electronAPI.getSession(todayString())
  if (sess) {
    state.baseNoseSeconds  = sess.noseBreathingSeconds  ?? 0
    state.baseMouthSeconds = sess.mouthBreathingSeconds ?? 0
  }
  // Check if already at today's free limit
  if (!authState.isPro) {
    const total = state.baseNoseSeconds + state.baseMouthSeconds
    if (total >= FREE_DAILY_LIMIT_SECONDS) {
      limitReached = true
      state.paused = true
      setTimeout(showLimitOverlay, 800)
    }
  }
}

// ── Alert popup ───────────────────────────────────────────────────────────────

function updateAlertBtnStyle(): void {
  if (alertFired && alertEnabled) {
    toolbarAlertBtn.classList.add('alert-fired')
  } else {
    toolbarAlertBtn.classList.remove('alert-fired')
  }
}

function formatMS(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function updateAlertCounter(): void {
  if (!alertEnabled || alertWindowTotalSeconds === 0) {
    alertWindowCounterEl.textContent = '—'
    return
  }
  alertWindowCounterEl.textContent = formatMS(alertWindowTotalSeconds)
}

function showToast(message: string): void {
  const toast = document.getElementById('toast')!
  toast.textContent = message
  toast.classList.remove('show')
  void (toast as HTMLElement).offsetWidth // force reflow to restart animation
  toast.classList.add('show')
}

function resetAlertWindow(): void {
  alertWindowStartTime = null
  alertWindowMouthSeconds = 0
  alertWindowTotalSeconds = 0
  alertFired = false
  updateAlertBtnStyle()
  updateAlertCounter()
}

function openAlertPopup(): void {
  alertBackdrop.classList.remove('hidden')
  alertPopup.classList.remove('hidden')
}

function closeAlertPopup(): void {
  alertBackdrop.classList.add('hidden')
  alertPopup.classList.add('hidden')
}

function bindAlertPopup(): void {
  document.getElementById('alert-popup-close')!.addEventListener('click', closeAlertPopup)
  alertBackdrop.addEventListener('click', closeAlertPopup)

  alertEnabledToggle.addEventListener('change', () => {
    alertEnabled = alertEnabledToggle.checked
    alertControlsEl.classList.toggle('disabled', !alertEnabled)
    if (!alertEnabled) resetAlertWindow()
    window.electronAPI.saveSettings({ alertEnabled })
  })

  alertWindowSelect.addEventListener('change', () => {
    alertWindowSeconds = parseInt(alertWindowSelect.value, 10)
    resetAlertWindow()
    window.electronAPI.saveSettings({ alertWindowSeconds })
  })

  alertThresholdSelect.addEventListener('input', () => {
    alertProportionThreshold = parseInt(alertThresholdSelect.value, 10) / 100
    alertThresholdDisplay.textContent = alertThresholdSelect.value + '%'
    resetAlertWindow()
    window.electronAPI.saveSettings({ alertProportionThreshold })
  })

  document.getElementById('alert-snooze-btn')!.addEventListener('click', () => {
    resetAlertWindow()
    showToast('Alert window reset ✓')
  })
}

// ── Camera toggle ─────────────────────────────────────────────────────────────

function toggleCamera(): void {
  if (cameraEnabled) {
    if (state.noFaceTimer) {
      clearTimeout(state.noFaceTimer)
      state.noFaceTimer = null
    }
    activeStream?.getTracks().forEach(t => t.stop())
    activeStream = null
    videoEl.srcObject = null
    state.cameraReady = false
    cameraEnabled = false
    cameraOffPlaceholder.classList.remove('hidden')
    videoEl.style.visibility = 'hidden'
    clearFaceMesh()
    faceBadge.textContent = ''
    faceBadge.className = ''
    cameraWrap.classList.remove('face-ok', 'face-missing')
    state.faceDetected = false
    state.paused = true
    setStateNone()
    updateStatusDot('')
    setStatus('Camera off')
    cameraToggleInput.checked = false
  } else {
    cameraOffPlaceholder.classList.add('hidden')
    videoEl.style.visibility = ''
    cameraEnabled = true
    cameraToggleInput.checked = true
    startCamera().then(ok => {
      if (ok) {
        setStatus('Detecting…')
      } else {
        cameraEnabled = false
        cameraToggleInput.checked = false
        cameraOffPlaceholder.classList.remove('hidden')
        videoEl.style.visibility = 'hidden'
      }
    })
  }
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function flashToolbarBtn(btn: Element): void {
  btn.classList.remove('tb-flash')
  void (btn as HTMLElement).offsetWidth
  btn.classList.add('tb-flash')
  btn.addEventListener('animationend', () => btn.classList.remove('tb-flash'), { once: true })
}

function bindToolbar(): void {
  document.querySelectorAll('.tb-btn').forEach(btn => {
    btn.addEventListener('click', () => flashToolbarBtn(btn))
  })

  document.getElementById('tb-settings')!.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden')
  })

  document.getElementById('tb-summary')!.addEventListener('click', async () => {
    await persistSession()
    const data = await window.electronAPI.getSummary()
    showSummaryModal(data)
  })

  cameraToggleInput.addEventListener('change', toggleCamera)

  document.getElementById('tb-alert')!.addEventListener('click', openAlertPopup)
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  setStatus('Initializing…')

  const settings = await loadSettings()
  bindSettingsEvents()
  bindToolbar()
  bindAlertPopup()
  initTutorial()
  initAuthUI()

  // Auth must resolve before restoreSession so isPro is known for limit check
  await initAuth((authUpdate) => {
    Object.assign(authState, authUpdate)
    updateAuthButton()
    // If user just upgraded to Pro, clear any active limit gate
    if (authUpdate.isPro && limitReached) {
      limitReached = false
      state.paused = false
      hideLimitOverlay()
    }
  })

  updateAuthButton()
  await restoreSession()

  if (!settings.cameraPermission) {
    showOnboarding()
  } else {
    const cameraOk = await startCamera()
    if (!cameraOk) {
      await window.electronAPI.saveSettings({ cameraPermission: false })
      showOnboarding()
      return
    }
    const detectorOk = await initMediaPipe()
    if (detectorOk) {
      if (!settings.tutorialSeen) {
        showTutorial()
      } else if (!settings.calibrated) {
        showCalibration()
      }
    }
  }
}

boot()
