import { useAppContext } from '../../store/AppContext'
import { ClockRing } from './ClockRing'

export function StateSection() {
  const { state } = useAppContext()
  const { mouthOpen, paused, lipsOccluded, faceDetected } = state

  let stateClass = 'state-none'
  let emoji = '👃'
  let label = 'WAITING'

  if (!paused && faceDetected && !lipsOccluded) {
    if (mouthOpen) {
      stateClass = 'state-mouth'
      emoji = '👄'
      label = 'MOUTH'
    } else {
      stateClass = 'state-nose'
      emoji = '👃'
      label = 'NOSE'
    }
  } else if (!paused && faceDetected && lipsOccluded) {
    emoji = '✋'
    label = 'MOUTH COVERED'
  } else if (paused && !faceDetected) {
    label = 'PAUSED'
  }

  return (
    <div id="state-section">
      <div id="state-indicator" className={stateClass}>
        <div id="clock-ring-wrap">
          <ClockRing />
        </div>
        <div id="pulse-ring"></div>
        <div id="state-emoji">{emoji}</div>
        <div id="state-label">{label}</div>
      </div>
    </div>
  )
}
