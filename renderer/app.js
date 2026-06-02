'use strict'

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  mouthOpen: false,
  faceDetected: false,
  paused: true,
  noFaceTimer: null,
  noseSeconds: 0,
  mouthSeconds: 0,
  sessionStart: new Date().toISOString(),
  threshold: 0.04,
  cameraReady: false,
  mediapipeReady: false,
  settings: {}
}

// Rolling buffer for smoothing (3-frame average)
const ratioBuffer = []
const BUFFER_SIZE = 3

// ── DOM refs ──────────────────────────────────────────────────────────────────
const videoEl         = document.getElementById('video')
const statusDot       = document.getElementById('status-dot')
const stateIndicator  = document.getElementById('state-indicator')
const stateEmoji      = document.getElementById('state-emoji')
const stateLabel      = document.getElementById('state-label')
const noseTimeEl      = document.getElementById('nose-time')
const mouthTimeEl     = document.getElementById('mouth-time')
const ratioFill       = document.getElementById('ratio-fill')
const nosePctLabel    = document.getElementById('nose-pct-label')
const mouthPctLabel   = document.getElementById('mouth-pct-label')
const statusBar       = document.getElementById('status-bar')

// Overlays
const onboardingEl    = document.getElementById('onboarding')
const calibrationEl   = document.getElementById('calibration-modal')
const summaryEl       = document.getElementById('summary-modal')
const settingsPanel   = document.getElementById('settings-panel')

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayString() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatTime(totalSeconds) {
  const s = Math.floor(totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':')
}

// ── MediaPipe FaceMesh ────────────────────────────────────────────────────────

// Landmark indices we care about
const LM = { UPPER_LIP_TOP: 13, LOWER_LIP_BOT: 14, FOREHEAD: 10, CHIN: 152 }

let faceMesh = null
let lastSendTime = 0

async function initMediaPipe() {
  if (typeof FaceMesh === 'undefined') {
    setStatus('FaceMesh not loaded — check internet connection')
    return false
  }

  setStatus('Loading detector… (first run may take ~20s)')

  faceMesh = new FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`
  })

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  })

  faceMesh.onResults(onFaceMeshResults)

  // Explicitly wait for WASM to download and compile before proceeding.
  // Without this, the first send() triggers lazy loading and calibration
  // collects zero samples because results don't arrive for 10-30s.
  try {
    await faceMesh.initialize()
  } catch (e) {
    setStatus('Detector init failed — check internet connection')
    return false
  }

  state.mediapipeReady = true
  setStatus('Detecting…')
  startDetectionLoop()
  return true
}

function startDetectionLoop() {
  function loop() {
    requestAnimationFrame(loop)
    if (!state.cameraReady || !state.mediapipeReady || !faceMesh) return
    const now = Date.now()
    if (now - lastSendTime >= 200) {
      lastSendTime = now
      // Only send when the video element has actual frame data
      if (videoEl.readyState >= 2) {
        faceMesh.send({ image: videoEl }).catch(() => {})
      }
    }
  }
  loop()
}

function computeMouthRatio(landmarks) {
  const get = (i) => landmarks[i]
  const lipGap   = Math.abs(get(LM.LOWER_LIP_BOT).y - get(LM.UPPER_LIP_TOP).y)
  const faceH    = Math.abs(get(LM.CHIN).y - get(LM.FOREHEAD).y)
  if (faceH < 0.001) return 0
  return lipGap / faceH
}

function classifyMouth(landmarks) {
  const ratio = computeMouthRatio(landmarks)
  ratioBuffer.push(ratio)
  if (ratioBuffer.length > BUFFER_SIZE) ratioBuffer.shift()
  const avg = ratioBuffer.reduce((a, b) => a + b, 0) / ratioBuffer.length
  return avg > state.threshold
}

function onFaceMeshResults(results) {
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    handleNoFace()
    return
  }
  handleFaceDetected()
  const landmarks = results.multiFaceLandmarks[0]
  state.mouthOpen = classifyMouth(landmarks)
  updateStateUI()

  // Calibration live display
  if (calibrationState.active) {
    const ratio = computeMouthRatio(landmarks)
    const el = document.getElementById('calibration-ratio-display')
    if (el) el.textContent = ratio.toFixed(4)
    if (calibrationState.collecting) {
      calibrationState.samples.push(ratio)
    }
  }
}

function handleNoFace() {
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

function handleFaceDetected() {
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

function updateStateUI() {
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

function setStateNone() {
  stateIndicator.className = 'state-none'
  stateEmoji.textContent = '👃'
  stateLabel.textContent = 'PAUSED'
}

function updateStatusDot(mode) {
  statusDot.className = mode // 'detecting' | 'no-face' | ''
}

function setStatus(text) {
  statusBar.textContent = text
}

function updateCounterUI() {
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

  // Save to main every 30 seconds
  saveDebounceCount++
  if (saveDebounceCount >= 30) {
    saveDebounceCount = 0
    persistSession()
  }
}, 1000)

function persistSession() {
  window.electronAPI.saveSession({
    date: todayString(),
    sessionStart: state.sessionStart,
    mouthBreathingSeconds: state.mouthSeconds,
    noseBreathingSeconds: state.noseSeconds
  })
}

// ── Camera ────────────────────────────────────────────────────────────────────

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' }
    })
    videoEl.srcObject = stream

    // Wait for video metadata so frames are available before we proceed
    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = () => {
        videoEl.play().then(resolve).catch(reject)
      }
      videoEl.onerror = reject
    })

    state.cameraReady = true
    return true
  } catch (err) {
    setStatus('Camera unavailable: ' + err.message)
    updateStatusDot('')
    return false
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function loadSettings() {
  const s = await window.electronAPI.getSettings()
  state.settings = s
  state.threshold = s.threshold || 0.04

  // Apply to UI controls
  document.getElementById('setting-always-on-top').checked = !!s.alwaysOnTop
  document.getElementById('setting-start-at-login').checked = !!s.startAtLogin
  document.getElementById('setting-summary-time').value = s.summaryTime || '18:00'
  const thresholdEl = document.getElementById('setting-threshold')
  thresholdEl.value = s.threshold || 0.04
  document.getElementById('threshold-display').textContent =
    parseFloat(thresholdEl.value).toFixed(3)

  return s
}

function bindSettingsEvents() {
  const alwaysOnTopEl   = document.getElementById('setting-always-on-top')
  const startAtLoginEl  = document.getElementById('setting-start-at-login')
  const summaryTimeEl   = document.getElementById('setting-summary-time')
  const thresholdEl     = document.getElementById('setting-threshold')
  const thresholdDisplay = document.getElementById('threshold-display')

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

  // Open / close settings panel
  document.getElementById('settings-btn').addEventListener('click', () => {
    settingsPanel.classList.remove('hidden')
  })

  document.getElementById('settings-close-btn').addEventListener('click', () => {
    settingsPanel.classList.add('hidden')
  })

  document.getElementById('view-summary-btn').addEventListener('click', async () => {
    settingsPanel.classList.add('hidden')
    const data = await window.electronAPI.getSummary()
    showSummaryModal(data)
  })

  document.getElementById('recalibrate-btn').addEventListener('click', () => {
    settingsPanel.classList.add('hidden')
    showCalibration()
  })

  // Listen for settings pushed from main
  window.electronAPI.onSettingsChanged((newSettings) => {
    state.settings = newSettings
    state.threshold = newSettings.threshold || 0.04
    alwaysOnTopEl.checked  = !!newSettings.alwaysOnTop
    startAtLoginEl.checked = !!newSettings.startAtLogin
  })
}

// ── Onboarding ────────────────────────────────────────────────────────────────

function showOnboarding() {
  onboardingEl.classList.remove('hidden')

  document.getElementById('ob-allow-btn').addEventListener('click', async () => {
    onboardingEl.classList.add('hidden')
    const granted = await window.electronAPI.requestCameraPermission()
    if (granted === 'granted') {
      const cameraOk = await startCamera()
      if (cameraOk) {
        await window.electronAPI.saveSettings({ cameraPermission: true })
        const detectorOk = await initMediaPipe()
        if (detectorOk && !state.settings.calibrated) {
          showCalibration()
        }
      }
    } else {
      setStatus('Camera permission denied')
    }
  }, { once: true })

  document.getElementById('ob-skip-btn').addEventListener('click', () => {
    onboardingEl.classList.add('hidden')
    setStatus('Camera not enabled — click ⚙ to set up')
  }, { once: true })
}

// ── Calibration ───────────────────────────────────────────────────────────────

const calibrationState = {
  active: false,
  collecting: false,
  samples: [],
  step: 0  // 0=idle, 1=closed, 2=open
}

function showCalibration() {
  calibrationEl.classList.remove('hidden')
  calibrationState.active = true
  calibrationState.step = 0
  calibrationState.samples = []

  updateCalDots(0)
  document.getElementById('calibration-step-label').textContent = 'Press Start to begin'
  document.getElementById('calibration-ratio-display').textContent = '—'
}

function updateCalDots(step) {
  for (let i = 0; i < 3; i++) {
    const dot = document.getElementById(`cal-dot-${i}`)
    dot.className = 'cal-dot' + (i < step ? ' done' : '') + (i === step ? ' active' : '')
  }
}

document.getElementById('cal-start-btn').addEventListener('click', () => {
  if (calibrationState.step === 0) {
    runCalStep1()
  }
})

document.getElementById('cal-skip-btn').addEventListener('click', () => {
  calibrationEl.classList.add('hidden')
  calibrationState.active = false
  window.electronAPI.saveSettings({ calibrated: true })
})

async function runCalStep1() {
  const btn   = document.getElementById('cal-start-btn')
  const label = document.getElementById('calibration-step-label')

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

  // Set threshold at midpoint
  const threshold = parseFloat(((closedAvg + openAvg) / 2).toFixed(4))
  const clamped   = Math.min(Math.max(threshold, 0.01), 0.12)

  state.threshold = clamped
  document.getElementById('setting-threshold').value = clamped
  document.getElementById('threshold-display').textContent = clamped.toFixed(3)
  await window.electronAPI.saveSettings({ threshold: clamped, calibrated: true })

  calibrationState.active = false
  calibrationState.step = -1  // -1 = done; prevents outer listener from re-triggering
  updateCalDots(3)
  label.textContent = `Done! Threshold set to ${clamped.toFixed(4)}`
  btn.textContent = 'Close'
  btn.disabled = false

  btn.addEventListener('click', () => {
    calibrationEl.classList.add('hidden')
    btn.textContent = 'Start Calibration'
  }, { once: true })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function avg(arr)  { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0 }

// ── Daily Summary ─────────────────────────────────────────────────────────────

window.electronAPI.onDailySummaryTrigger(async (data) => {
  // Save final session first
  persistSession()

  // Show OS notification
  await window.electronAPI.showNotification({
    title: 'Mouth Breather Daily Summary',
    body: buildSummaryBody(data)
  })

  showSummaryModal(data)
})

function buildSummaryBody({ noseSeconds, mouthSeconds }) {
  const total = noseSeconds + mouthSeconds
  if (total === 0) return 'No data recorded today.'
  const nosePct = Math.round((noseSeconds / total) * 100)
  return nosePct >= 80
    ? `Great day! ${nosePct}% nose breathing 👃`
    : `${nosePct}% nose / ${100 - nosePct}% mouth — keep it up!`
}

function showSummaryModal(data) {
  const { date, noseSeconds, mouthSeconds, streak } = data
  const total    = noseSeconds + mouthSeconds
  const nosePct  = total > 0 ? Math.round((noseSeconds / total) * 100) : 0
  const mouthPct = 100 - nosePct

  document.getElementById('summary-date').textContent = date
  document.getElementById('summary-total').textContent =
    `Total tracked: ${formatTime(total)}`
  document.getElementById('legend-nose-pct').textContent  = nosePct  + '% Nose'
  document.getElementById('legend-mouth-pct').textContent = mouthPct + '% Mouth'

  if (streak > 0) {
    document.getElementById('summary-streak').textContent =
      `🔥 ${streak} day${streak !== 1 ? 's' : ''} in a row with <20% mouth breathing`
  } else {
    document.getElementById('summary-streak').textContent = ''
  }

  const msgEl = document.getElementById('summary-message')
  if (nosePct >= 80) {
    msgEl.textContent = 'Great day! 🎉'
    msgEl.className = ''
  } else {
    msgEl.textContent = 'Room to improve 💪'
    msgEl.className = 'warn'
  }

  drawDonut(document.getElementById('donut-chart'), nosePct, mouthPct)
  summaryEl.classList.remove('hidden')

  // Reset daily counters after summary
  state.noseSeconds  = 0
  state.mouthSeconds = 0
  state.sessionStart = new Date().toISOString()
  updateCounterUI()
}

document.getElementById('summary-close-btn').addEventListener('click', () => {
  summaryEl.classList.add('hidden')
})

function drawDonut(canvas, nosePct, mouthPct) {
  const ctx  = canvas.getContext('2d')
  const size = canvas.width
  const cx   = size / 2
  const cy   = size / 2
  const r    = size * 0.38
  const lw   = size * 0.14
  const TAU  = Math.PI * 2
  const start = -Math.PI / 2
  const noseFrac = nosePct / 100

  ctx.clearRect(0, 0, size, size)

  // Background ring
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.strokeStyle = '#1e1e1e'
  ctx.lineWidth = lw
  ctx.stroke()

  // Mouth arc (drawn first so nose overlaps at join)
  if (mouthPct > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, start + noseFrac * TAU, start + TAU)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = lw
    ctx.lineCap = 'butt'
    ctx.stroke()
  }

  // Nose arc
  if (nosePct > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, start, start + noseFrac * TAU)
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = lw
    ctx.lineCap = 'butt'
    ctx.stroke()
  }

  // Center text
  ctx.fillStyle = '#e5e5e5'
  ctx.font = `bold ${Math.round(size * 0.17)}px system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${nosePct}%`, cx, cy - size * 0.05)
  ctx.font = `${Math.round(size * 0.09)}px system-ui`
  ctx.fillStyle = '#6b7280'
  ctx.fillText('nose', cx, cy + size * 0.1)
}

// ── Restore today's session data ──────────────────────────────────────────────

async function restoreSession() {
  const session = await window.electronAPI.getSession(todayString())
  if (session) {
    state.noseSeconds   = session.noseBreathingSeconds  || 0
    state.mouthSeconds  = session.mouthBreathingSeconds || 0
    state.sessionStart  = session.sessionStart || new Date().toISOString()
    updateCounterUI()
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  setStatus('Initializing…')

  const settings = await loadSettings()
  bindSettingsEvents()

  await restoreSession()

  const needsOnboarding = !settings.cameraPermission
  if (needsOnboarding) {
    showOnboarding()
  } else {
    const cameraOk = await startCamera()
    if (cameraOk) {
      const detectorOk = await initMediaPipe()
      if (detectorOk && !settings.calibrated) {
        showCalibration()
      }
    }
  }
}

boot()
