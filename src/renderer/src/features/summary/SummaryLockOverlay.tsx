import { useAppContext } from '../../store/AppContext'

export function SummaryLockOverlay() {
  const { state, dispatch } = useAppContext()

  function handleDismiss(): void {
    dispatch({ type: 'HIDE_MODAL', payload: 'summaryLocked' })
  }

  function handleUpgrade(): void {
    dispatch({ type: 'HIDE_MODAL', payload: 'summaryLocked' })
    dispatch({ type: 'SET_STATUS', payload: 'Pro subscriptions coming soon!' })
  }

  return (
    <div id="summary-lock-overlay" className={`overlay${state.showSummaryLockOverlay ? '' : ' hidden'}`}>
      <div className="ob-icon">🔒</div>
      <h2>Daily Summary is a Pro Feature</h2>
      <p>Upgrade to Pro to see your daily nose/mouth breathing breakdown, streaks, and 7-day history.</p>
      <button
        className="btn btn-primary"
        id="summary-lock-upgrade-btn"
        style={{ width: '100%', maxWidth: '220px' }}
        onClick={handleUpgrade}
      >Upgrade to Pro</button>
      <button
        className="btn btn-ghost"
        id="summary-lock-dismiss-btn"
        style={{ fontSize: '11px' }}
        onClick={handleDismiss}
      >Dismiss</button>
    </div>
  )
}
