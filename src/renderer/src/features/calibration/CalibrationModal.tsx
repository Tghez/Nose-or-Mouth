import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { useAppContext } from '../../store/AppContext'
import type { CalibrationHookState, CalibrationRefs } from '../../hooks/useCalibration'

interface CalibrationModalProps {
  calState: CalibrationHookState
  calibrationRefs: CalibrationRefs
  videoRef: RefObject<HTMLVideoElement | null>
  onStart: () => void
  onClose: () => void
  onSkip: () => void
}

interface CamRect {
  top: number
  left: number
  width: number
  height: number
}

// Window is a fixed 420x510 — this is only a placeholder used for the very
// first paint, before the real #camera-wrap rect has been measured.
const FALLBACK_RECT: CamRect = { top: 104, left: 50, width: 320, height: 180 }

const R = 27
const CX = 32
const CIRCUMFERENCE = 2 * Math.PI * R
const SEGMENT_FULL = CIRCUMFERENCE / 3
const GAP = 6
const SEGMENT_LEN = SEGMENT_FULL - GAP
const DASHARRAY = `${SEGMENT_LEN.toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`
// Offsets position each segment without wrapping past the path seam.
// A <g rotate(-90)> on the circles shifts the visual start to 12 o'clock.
const OFFSETS = [0, -SEGMENT_FULL, -SEGMENT_FULL * 2]

export function CalibrationModal({ calState, videoRef, onStart, onClose, onSkip }: CalibrationModalProps) {
  const { state, dispatch } = useAppContext()
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const [camRect, setCamRect] = useState<CamRect>(FALLBACK_RECT)

  // Mirror the live camera stream into this modal's own <video> element so the
  // user can see their face while calibrating — the main <video> in
  // CameraSection stays hidden behind this overlay (z-index), so we can't just
  // reuse it. Multiple <video> elements can play the same MediaStream at once.
  //
  // Position is measured from the real #camera-wrap (main screen) rather than
  // hardcoded, so the preview lands in exactly the same spot on screen — the
  // overlay background is slightly translucent, so any mismatch shows through
  // as a ghosting/double-image artifact.
  useLayoutEffect(() => {
    if (!state.showCalibration) return
    const sourceStream = videoRef.current?.srcObject ?? null
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = sourceStream
    }
    const mainCamWrap = document.getElementById('camera-wrap')
    if (mainCamWrap) {
      const rect = mainCamWrap.getBoundingClientRect()
      setCamRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    }
  }, [state.showCalibration, videoRef])

  function handlePrimaryBtn(): void {
    if (calState.done) {
      dispatch({ type: 'HIDE_MODAL', payload: 'calibration' })
      onClose()
    } else if (calState.step === 0) {
      onStart()
    }
  }

  const showPrimary = calState.step === 0 || calState.done
  const showSkip = !calState.done
  const faceOk = state.cameraEnabled && state.faceDetected

  let videoOverlay: ReactNode = null
  if (calState.phase === 'countdown' && calState.countdown !== null) {
    videoOverlay = (
      <div className="cal-countdown">
        {/* key forces DOM remount so the pop animation replays on each number */}
        <span key={calState.countdown} className="cal-countdown-num">
          {calState.countdown}
        </span>
      </div>
    )
  } else if (calState.phase === 'collecting') {
    videoOverlay = <div className="cal-ratio-badge">{calState.ratioDisplay}</div>
  } else if (calState.done) {
    videoOverlay = (
      <div className="cal-countdown" style={{ color: 'var(--nose-color)' }}>✓</div>
    )
  }

  return (
    <div id="calibration-modal" className={`overlay${state.showCalibration ? '' : ' hidden'}`}>
      <h2
        className="cal-header"
        style={{ left: camRect.left, width: camRect.width, bottom: window.innerHeight - camRect.top + 8 }}
      >
        Calibrate Detection
      </h2>

      <div
        className={`cal-camera-wrap${faceOk ? ' face-ok' : ''}`}
        style={{ top: camRect.top, left: camRect.left, width: camRect.width, height: camRect.height }}
      >
        <video ref={previewVideoRef} autoPlay playsInline muted />
        {videoOverlay}
      </div>

      <div
        className="cal-below-camera"
        style={{ top: camRect.top + camRect.height + 14, left: camRect.left, width: camRect.width }}
      >
        <div className="cal-ring-wrap">
          <svg className="cal-ring" width="64" height="64" viewBox="0 0 64 64">
            {/* rotate -90° so segment 1 starts at 12 o'clock instead of 3 o'clock */}
            <g transform={`rotate(-90 ${CX} ${CX})`}>
              {OFFSETS.map((offset, i) => (
                <circle
                  key={`track-${i}`}
                  cx={CX}
                  cy={CX}
                  r={R}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={8}
                  strokeDasharray={DASHARRAY}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                />
              ))}
              {OFFSETS.map((offset, i) => {
                const segIndex = i + 1
                return calState.completedSteps >= segIndex ? (
                  <circle
                    key={`fill-${i}`}
                    cx={CX}
                    cy={CX}
                    r={R}
                    fill="none"
                    stroke="var(--nose-color)"
                    strokeWidth={8}
                    strokeDasharray={DASHARRAY}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="cal-segment filled"
                  />
                ) : null
              })}
            </g>
          </svg>
        </div>

        <div className="cal-instruction">{calState.instruction}</div>
        <div className="cal-explanation">{calState.explanation}</div>

        {showPrimary && (
          <button
            className="btn btn-primary"
            id="cal-start-btn"
            style={{ width: '100%', maxWidth: '200px' }}
            disabled={calState.btnDisabled}
            onClick={handlePrimaryBtn}
          >
            {calState.btnLabel}
          </button>
        )}

        {showSkip && (
          <button
            className="btn btn-ghost"
            id="cal-skip-btn"
            style={{ fontSize: '11px' }}
            onClick={onSkip}
          >
            Use default threshold
          </button>
        )}
      </div>
    </div>
  )
}
