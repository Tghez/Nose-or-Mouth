import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { useAppContext } from '../../store/AppContext'

interface TutorialStep {
  target: string | null
  icon: string
  title: string
  body: string
}

const STEPS: TutorialStep[] = [
  {
    target: null,
    icon: '🫁',
    title: 'Welcome to Mouth Breather',
    body: "A short tour, then we'll calibrate detection to your face"
  },
  {
    target: 'camera-controls',
    icon: '🎚️',
    title: 'Overlay & Camera Toggles',
    body: 'Hide the face mesh outline or turn the camera off anytime'
  },
  {
    target: 'clock-ring-wrap',
    icon: '🔔',
    title: 'Alert Clock',
    body: 'This ring fills up toward your alert window — set it up under Alerts'
  },
  {
    target: 'stats-section',
    icon: '⏱️',
    title: 'Daily Timers',
    body: 'Nose vs. mouth breathing time today'
  },
  {
    target: 'tb-settings',
    icon: '⚙️',
    title: 'Settings',
    body: "Sensitivity, appearance, and your account live here"
  },
  {
    target: 'tb-summary',
    icon: '📊',
    title: 'Summary',
    body: "A daily and weekly summary of your breathing lives here"
  },
  {
    target: 'tb-alert',
    icon: '🔔',
    title: 'Alerts',
    body: 'Configure and reset breathing alerts here'
  },
  {
    target: 'title-btn-min',
    icon: '➖',
    title: 'Compact View',
    body: 'Minimize to a small floating widget that stays out of your way'
  },
  {
    target: null,
    icon: '✅',
    title: "You're All Set!",
    body: "Let's calibrate detection to your face."
  }
]

const GAP = 12
const PAD = 6
const TOOLTIP_WIDTH = 210
// Half-width of the arrow's triangular head, so it never overflows past the
// edge of the (boxless) floating text column.
const ARROW_HALF = 6
// Conservative estimate of the floating text's own height (icon + title +
// short 1-line body + buttons) — used only to keep it from being placed
// where it would run off the fixed 420x510 window.
const TOOLTIP_MAX_H = 150

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

interface TutorialOverlayProps {
  onFinish: () => void
}

export function TutorialOverlay({ onFinish }: TutorialOverlayProps) {
  const { state, dispatch } = useAppContext()
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const active = state.showTutorial
  const step = STEPS[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === STEPS.length - 1

  // Restart from the first step each time the tour is (re)opened — otherwise
  // replaying it (e.g. via Settings) would resume wherever it was last left.
  useEffect(() => {
    if (active) setStepIndex(0)
  }, [active])

  // Measure the target element after render so the spotlight lands in the right spot.
  useLayoutEffect(() => {
    if (!active || !step.target) {
      setRect(null)
      return
    }
    const el = document.getElementById(step.target)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [active, stepIndex])

  function finish(): void {
    dispatch({ type: 'HIDE_MODAL', payload: 'tutorial' })
    window.electronAPI.saveSettings({ tutorialSeenV2: true })
    dispatch({ type: 'SET_SETTINGS', payload: { tutorialSeenV2: true } })
    onFinish()
  }

  function handleNext(): void {
    if (isLast) finish()
    else setStepIndex(i => i + 1)
  }

  function handleBack(): void {
    setStepIndex(i => Math.max(0, i - 1))
  }

  const winW = window.innerWidth || 420
  const winH = window.innerHeight || 510

  // Place the tooltip on whichever side of the target has more room, then
  // clamp so it can never be pushed off the (fixed-size, non-scrolling) window.
  let tooltipStyle: CSSProperties = {}
  let arrowLeft = TOOLTIP_WIDTH / 2 - 1.5
  let placeBelow = true
  if (rect) {
    const spaceBelow = winH - (rect.top + rect.height)
    const spaceAbove = rect.top
    placeBelow = spaceBelow >= spaceAbove

    const centerX = rect.left + rect.width / 2
    let left = centerX - TOOLTIP_WIDTH / 2
    left = Math.min(Math.max(left, 10), winW - 10 - TOOLTIP_WIDTH)
    arrowLeft = Math.min(Math.max(centerX - left - 1.5, ARROW_HALF), TOOLTIP_WIDTH - ARROW_HALF - 3)

    if (placeBelow) {
      const top = Math.min(rect.top + rect.height + PAD + GAP, winH - TOOLTIP_MAX_H - 8)
      tooltipStyle = { left, top }
    } else {
      const bottom = Math.min(winH - (rect.top - PAD) + GAP, winH - TOOLTIP_MAX_H - 8)
      tooltipStyle = { left, bottom }
    }
  }

  const cardBody = (
    <>
      <div className="tut-icon">{step.icon}</div>
      <h2 className="tut-title">{step.title}</h2>
      <p className="tut-body">{step.body}</p>
      {isLast ? (
        <button className="tut-esc-btn" onClick={finish}>Close</button>
      ) : (
        <div className="tut-nav">
          <button
            className="tut-nav-arrow"
            onClick={handleBack}
            disabled={isFirst}
            aria-label="Previous step"
          >‹</button>
          <span className="tut-nav-stage">{stepIndex + 1} / {STEPS.length}</span>
          <button
            className="tut-nav-arrow"
            onClick={handleNext}
            aria-label="Next step"
          >›</button>
        </div>
      )}
      {isFirst && (
        <button className="tut-skip-link" onClick={finish}>Skip tour</button>
      )}
    </>
  )

  return (
    <div
      id="tutorial-overlay"
      className={`overlay${active ? '' : ' hidden'}${rect ? ' tut-spotlight-mode' : ''}`}
    >
      {rect ? (
        <>
          <div
            className="tut-spotlight"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2
            }}
          />
          <div key={stepIndex} className="tut-tooltip" style={tooltipStyle}>
            <span
              className={`tut-arrow ${placeBelow ? 'tut-arrow-up' : 'tut-arrow-down'}`}
              style={{ left: arrowLeft }}
            />
            {cardBody}
          </div>
        </>
      ) : (
        <div key={stepIndex} id="tutorial-card">
          {cardBody}
        </div>
      )}
    </div>
  )
}
