import { useAppContext } from '../../store/AppContext'

interface OnboardingOverlayProps {
  onAllow: () => Promise<void>
}

export function OnboardingOverlay({ onAllow }: OnboardingOverlayProps) {
  const { state, dispatch } = useAppContext()

  async function handleAllow(): Promise<void> {
    dispatch({ type: 'HIDE_MODAL', payload: 'onboarding' })
    await onAllow()
  }

  function handleSkip(): void {
    dispatch({ type: 'HIDE_MODAL', payload: 'onboarding' })
    dispatch({ type: 'SET_STATUS', payload: 'Camera not enabled — use Settings to set up' })
  }

  return (
    <div id="onboarding" className={`overlay${state.showOnboarding ? '' : ' hidden'}`}>
      <div className="ob-icon">🫁</div>
      <h1>Mouth Breather</h1>
      <p>Real-time breathing awareness. Keep the app open while you work and it will quietly track whether you're breathing through your nose or mouth.</p>
      <p className="privacy-badge">🔒 All processing is local — no data leaves this device</p>
      <button
        className="btn btn-primary"
        id="ob-allow-btn"
        style={{ width: '100%', maxWidth: '220px' }}
        onClick={handleAllow}
      >
        Allow Camera Access
      </button>
      <button
        className="btn btn-ghost"
        id="ob-skip-btn"
        style={{ fontSize: '11px' }}
        onClick={handleSkip}
      >
        Set up later
      </button>
    </div>
  )
}
