import { useAppContext } from '../../store/AppContext'

export function LimitOverlay() {
  const { state, dispatch } = useAppContext()

  function handleDismiss(): void {
    dispatch({ type: 'HIDE_MODAL', payload: 'limit' })
  }

  function handleUpgrade(): void {
    dispatch({ type: 'HIDE_MODAL', payload: 'limit' })
    dispatch({ type: 'SET_STATUS', payload: 'Pro subscriptions coming soon!' })
  }

  return (
    <div id="limit-overlay" className={`overlay${state.showLimitOverlay ? '' : ' hidden'}`}>
      <div className="ob-icon">⏱️</div>
      <h2>Daily Limit Reached</h2>
      <p>Free accounts get <strong>10 minutes</strong> of live detection per day.</p>
      <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
        Upgrade to Pro for unlimited access + cloud sync.
      </p>
      <button
        className="btn btn-primary"
        id="limit-upgrade-btn"
        style={{ width: '100%', maxWidth: '220px' }}
        onClick={handleUpgrade}
      >Upgrade to Pro</button>
      <button
        className="btn btn-ghost"
        id="limit-dismiss-btn"
        style={{ fontSize: '11px' }}
        onClick={handleDismiss}
      >Dismiss</button>
    </div>
  )
}
