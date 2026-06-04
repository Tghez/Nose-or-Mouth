import './styles.css'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import type { AppState, CalibrationState } from '../../types/state'
import type { StoreSchema, SummaryData } from '../../types/session'
import { initAuth, signIn, signUp, signOut, syncSession, authState } from './auth'
import { isSupabaseConfigured } from './supabase'

const FREE_DAILY_LIMIT_SECONDS = 600 // 10 minutes for free tier
let limitReached = false

// ── State ─────────────────────────────────────────────────────────────────────
const state: AppState = {
  mouthOpen: false,
  faceDetected: false,
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
      outputFaceBlendshapes: true,
      runningMode: 'VIDEO',
      numFaces: 1,
    })
  } catch (err) {
    console.error('FaceLandmarker init error:', err)
    setStatus('Detector init failed')
    return false
  }

  state.mediapipeReady = true
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
      if (videoEl.readyState >= 2) {
        try {
          const results = faceLandmarker.detectForVideo(videoEl, performance.now())
          onFaceLandmarkerResults(results)
        } catch (err) {
          console.error('detectForVideo error:', err)
        }
      }
    }
  }
  loop()
}

function getJawOpen(results: FaceLandmarkerResult): number {
  const cats = results.faceBlendshapes?.[0]?.categories
  if (!cats) return 0
  return cats.find(c => c.categoryName === 'jawOpen')?.score ?? 0
}

function classifyMouth(jawOpen: number): boolean {
  ratioBuffer.push(jawOpen)
  if (ratioBuffer.length > BUFFER_SIZE) ratioBuffer.shift()
  const avg = ratioBuffer.reduce((a, b) => a + b, 0) / ratioBuffer.length
  return avg > state.threshold
}

function onFaceLandmarkerResults(results: FaceLandmarkerResult): void {
  if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
    handleNoFace()
    return
  }
  handleFaceDetected()

  const jawOpen = getJawOpen(results)
  state.mouthOpen = classifyMouth(jawOpen)
  updateStateUI()

  if (calibrationState.active) {
    const el = document.getElementById('calibration-ratio-display')
    if (el) el.textContent = jawOpen.toFixed(4)
    if (calibrationState.collecting) calibrationState.samples.push(jawOpen)
  }
}

function handleNoFace(): void {
  updateStatusDot('no-face')
  if (state.faceDetected) {
    state.faceDetected = false
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
  setStatus('Detecting…')
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
  if (state.paused || !state.faceDetected) return

  if (state.mouthOpen) {
    state.mouthSeconds++
  } else {
    state.noseSeconds++
  }

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

function persistSession(): void {
  const payload = {
    date: todayString(),
    sessionStart: state.sessionStart,
    mouthBreathingSeconds: state.baseMouthSeconds + state.mouthSeconds,
    noseBreathingSeconds:  state.baseNoseSeconds  + state.noseSeconds
  }
  window.electronAPI.saveSession(payload)
  syncSession(payload).catch(() => {}) // cloud sync — fire and forget
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
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' }
    })
    videoEl.srcObject = stream

    await new Promise<void>((resolve, reject) => {
      videoEl.onloadedmetadata = () => {
        videoEl.play().then(resolve).catch(reject)
      }
      videoEl.onerror = reject
    })

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

  // jawOpen blendshape lives in [0, 1]; reset any threshold from previous metrics.
  const stored = s.threshold ?? 0.2
  const isStale = stored < 0 || stored > 1.0
  if (isStale) await window.electronAPI.saveSettings({ calibrated: false, threshold: 0.2 })
  const effective = isStale ? 0.2 : stored
  state.threshold = effective

  ;(document.getElementById('setting-always-on-top') as HTMLInputElement).checked = !!s.alwaysOnTop
  ;(document.getElementById('setting-start-at-login') as HTMLInputElement).checked = !!s.startAtLogin
  ;(document.getElementById('setting-summary-time') as HTMLInputElement).value = s.summaryTime ?? '18:00'
  const thresholdEl = document.getElementById('setting-threshold') as HTMLInputElement
  thresholdEl.value = String(effective)
  ;(document.getElementById('threshold-display') as HTMLSpanElement).textContent =
    parseFloat(thresholdEl.value).toFixed(3)

  return s
}

function bindSettingsEvents(): void {
  const alwaysOnTopEl    = document.getElementById('setting-always-on-top') as HTMLInputElement
  const startAtLoginEl   = document.getElementById('setting-start-at-login') as HTMLInputElement
  const summaryTimeEl    = document.getElementById('setting-summary-time') as HTMLInputElement
  const thresholdEl      = document.getElementById('setting-threshold') as HTMLInputElement
  const thresholdDisplay = document.getElementById('threshold-display') as HTMLSpanElement

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

  document.getElementById('settings-btn')!.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden')
  })

  document.getElementById('settings-close-btn')!.addEventListener('click', () => {
    settingsPanel.classList.add('hidden')
  })

  document.getElementById('view-summary-btn')!.addEventListener('click', async () => {
    settingsPanel.classList.add('hidden')
    const data = await window.electronAPI.getSummary()
    showSummaryModal(data)
  })

  document.getElementById('recalibrate-btn')!.addEventListener('click', () => {
    settingsPanel.classList.add('hidden')
    showCalibration()
  })

  window.electronAPI.onSettingsChanged((newSettings) => {
    state.settings = newSettings
    state.threshold = newSettings.threshold ?? 0.2
    alwaysOnTopEl.checked  = !!newSettings.alwaysOnTop
    startAtLoginEl.checked = !!newSettings.startAtLogin
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
    body: "Tap the gear icon (top-right) to adjust detection sensitivity, set a daily summary reminder, and view today's stats anytime."
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
    setStatus('Camera not enabled — click ⚙ to set up')
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

  state.noseSeconds  = 0
  state.mouthSeconds = 0
  state.sessionStart = new Date().toISOString()
  updateCounterUI()
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

  ctx.clearRect(0, 0, size, size)

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.strokeStyle = '#1e1e1e'
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

  ctx.fillStyle = '#e5e5e5'
  ctx.font = `bold ${Math.round(size * 0.17)}px system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${nosePct}%`, cx, cy - size * 0.05)
  ctx.font = `${Math.round(size * 0.09)}px system-ui`
  ctx.fillStyle = '#6b7280'
  ctx.fillText('nose', cx, cy + size * 0.1)
}

// ── Auth UI ───────────────────────────────────────────────────────────────

function updateAuthButton(): void {
  const btn = document.getElementById('auth-btn') as HTMLButtonElement
  if (!isSupabaseConfigured) { btn.style.display = 'none'; return }
  if (authState.user) {
    btn.textContent = '☁️'
    btn.title = `${authState.user.email} (${authState.isPro ? 'Pro' : 'Free'})`
    btn.classList.add('connected')
  } else {
    btn.textContent = '👤'
    btn.title = 'Sign in for cloud sync'
    btn.classList.remove('connected')
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

  const authBtn    = document.getElementById('auth-btn')!
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

  authBtn.addEventListener('click', openAuthModal)
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

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  setStatus('Initializing…')

  const settings = await loadSettings()
  bindSettingsEvents()
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
