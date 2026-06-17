import { useAppContext } from '../../store/AppContext'
import type { CalibrationRefs } from '../../hooks/useCalibration'

interface CalibrationModalProps {
  calState: {
    step: number
    stepLabel: string
    ratioDisplay: string
    btnDisabled: boolean
    btnLabel: string
    done: boolean
  }
  calibrationRefs: CalibrationRefs
  onStart: () => void
  onClose: () => void
  onSkip: () => void
}

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

  const dotClass = (i: number) => {
    const { step } = calState
    return 'cal-dot' + (i < step ? ' done' : '') + (i === step ? ' active' : '')
  }

  return (
    <div id="calibration-modal" className={`overlay${state.showCalibration ? '' : ' hidden'}`}>
      <h2>Calibrate Detection</h2>
      <p>We'll measure your natural mouth positions to set an accurate threshold for you.</p>

      <div id="calibration-step-label">{calState.stepLabel}</div>
      <div id="calibration-ratio-display">{calState.ratioDisplay}</div>

      <div id="calibration-progress">
        <div className={dotClass(0)} id="cal-dot-0"></div>
        <div className={dotClass(1)} id="cal-dot-1"></div>
        <div className={dotClass(2)} id="cal-dot-2"></div>
      </div>

      <button
        className="btn btn-primary"
        id="cal-start-btn"
        style={{ width: '100%', maxWidth: '200px' }}
        disabled={calState.btnDisabled}
        onClick={handlePrimaryBtn}
      >
        {calState.btnLabel}
      </button>
      {!calState.done && (
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
