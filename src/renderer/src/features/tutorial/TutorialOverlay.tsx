import { useState } from 'react'
import { useAppContext } from '../../store/AppContext'

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
    body: 'Use the toolbar at the top to adjust settings, view your daily summary, configure alerts, and toggle the camera.'
  }
]

interface TutorialOverlayProps {
  onFinish: () => void
}

export function TutorialOverlay({ onFinish }: TutorialOverlayProps) {
  const { state, dispatch } = useAppContext()
  const [stepIndex, setStepIndex] = useState(0)

  const step = TUTORIAL_STEPS[stepIndex]
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1

  function finish(): void {
    dispatch({ type: 'HIDE_MODAL', payload: 'tutorial' })
    window.electronAPI.saveSettings({ tutorialSeen: true })
    dispatch({ type: 'SET_SETTINGS', payload: { tutorialSeen: true } })
    onFinish()
  }

  function handleNext(): void {
    if (isLast) {
      finish()
    } else {
      setStepIndex(i => i + 1)
    }
  }

  return (
    <div id="tutorial-overlay" className={`overlay${state.showTutorial ? '' : ' hidden'}`}>
      <div id="tutorial-card">
        <div id="tutorial-icon">{step.icon}</div>
        <h2 id="tutorial-title">{step.title}</h2>
        <p id="tutorial-body">{step.body}</p>
        <div id="tutorial-dots">
          {TUTORIAL_STEPS.map((_, i) => (
            <span key={i} className={`tut-dot${i === stepIndex ? ' active' : ''}`}></span>
          ))}
        </div>
        <div id="tutorial-btns">
          <button className="btn btn-ghost" id="tutorial-skip-btn" onClick={finish}>Skip</button>
          <button className="btn btn-primary" id="tutorial-next-btn" onClick={handleNext}>
            {isLast ? 'Done ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
