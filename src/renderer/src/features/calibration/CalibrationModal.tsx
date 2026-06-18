import { type ReactNode } from 'react'
import { useAppContext } from '../../store/AppContext'
import type { CalibrationHookState, CalibrationRefs } from '../../hooks/useCalibration'

interface CalibrationModalProps {
  calState: CalibrationHookState
  calibrationRefs: CalibrationRefs
  onStart: () => void
  onClose: () => void
  onSkip: () => void
}

const R = 58
const CX = 80
const CIRCUMFERENCE = 2 * Math.PI * R
const SEGMENT_FULL = CIRCUMFERENCE / 3
const GAP = 8
const SEGMENT_LEN = SEGMENT_FULL - GAP
const DASHARRAY = `${SEGMENT_LEN.toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`
// Offsets position each segment without wrapping past the path seam.
// A <g rotate(-90)> on the circles shifts the visual start to 12 o'clock.
// Segment 1: path 0→113.5, Segment 2: 121.5→235, Segment 3: 243→356.5 (all < C=364.4)
const OFFSETS = [
  0,
  -SEGMENT_FULL,
  -SEGMENT_FULL * 2,
]

export function CalibrationModal({ calState, onStart, onClose, onSkip }: CalibrationModalProps) {
  const { state, dispatch } = useAppContext()

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

  let centerContent: ReactNode
  if (calState.phase === 'countdown' && calState.countdown !== null) {
    centerContent = (
      <div className="cal-countdown">
        {/* key forces DOM remount so the pop animation replays on each number */}
        <span key={calState.countdown} className="cal-countdown-num">
          {calState.countdown}
        </span>
      </div>
    )
  } else if (calState.phase === 'collecting') {
    centerContent = (
      <div className="cal-ratio-center">{calState.ratioDisplay}</div>
    )
  } else if (calState.done) {
    centerContent = (
      <div className="cal-countdown" style={{ fontSize: '32px', color: 'var(--nose-color)' }}>
        ✓
      </div>
    )
  } else {
    centerContent = (
      <div className="cal-ratio-center" style={{ fontSize: '16px' }}>1/3</div>
    )
  }

  return (
    <div id="calibration-modal" className={`overlay${state.showCalibration ? '' : ' hidden'}`}>
      <h2>Calibrate Detection</h2>
      <p>
        We'll measure your natural mouth positions
        <br />to set an accurate threshold for you.
      </p>

      <div className="cal-ring-wrap">
        <svg className="cal-ring" width="160" height="160" viewBox="0 0 160 160">
          {/* rotate -90° so segment 1 starts at 12 o'clock instead of 3 o'clock */}
          <g transform={`rotate(-90 ${CX} ${CX})`}>
            {/* Background track segments */}
            {OFFSETS.map((offset, i) => (
              <circle
                key={`track-${i}`}
                cx={CX}
                cy={CX}
                r={R}
                fill="none"
                stroke="var(--border)"
                strokeWidth={10}
                strokeDasharray={DASHARRAY}
                strokeDashoffset={offset}
                strokeLinecap="round"
              />
            ))}
            {/* Filled segments — rendered on top when step is complete */}
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
                  strokeWidth={10}
                  strokeDasharray={DASHARRAY}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  className="cal-segment filled"
                />
              ) : null
            })}
          </g>
        </svg>

        {centerContent}
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
  )
}
