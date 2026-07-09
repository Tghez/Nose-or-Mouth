import { useEffect, useRef, useState } from 'react'
import { useAppContext } from '../../store/AppContext'
import { useAuthContext } from '../../store/AuthContext'

export function AuthModal() {
  const { state, dispatch } = useAppContext()
  const { user, isPro, signInWithGoogle, signOut } = useAuthContext()
  const { showAuthModal } = state

  const [error, setError]           = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Auto-dismiss back to the app's home screen right after a sign-in completes
  // (transition from signed-out to signed-in while this modal is open) — but not
  // when the modal was opened to just view/manage an already-signed-in account.
  const prevUserRef = useRef(user)
  useEffect(() => {
    if (!prevUserRef.current && user && showAuthModal) {
      dispatch({ type: 'HIDE_MODAL', payload: 'auth' })
    }
    prevUserRef.current = user
  }, [user, showAuthModal, dispatch])

  async function handleGoogleSignIn(): Promise<void> {
    setSubmitting(true)
    setError(null)

    const err = await signInWithGoogle()

    if (err) {
      setError(err)
      setSubmitting(false)
    }
    // On success the browser takes over; the modal stays open (and the
    // spinner keeps showing) until the deep-link callback resolves the
    // session and this component unmounts/re-renders with `user` set.
  }

  async function handleSignOut(): Promise<void> {
    await signOut()
    dispatch({ type: 'HIDE_MODAL', payload: 'auth' })
  }

  function handleClose(): void {
    setSubmitting(false)
    setError(null)
    dispatch({ type: 'HIDE_MODAL', payload: 'auth' })
  }

  return (
    <div id="auth-modal" className={`overlay${showAuthModal ? '' : ' hidden'}`}>
      <div id="auth-card">
        {!user ? (
          <div id="auth-signedout">
            <p id="auth-info">Sign in with Google to enable cloud sync across devices.</p>
            {error && (
              <div id="auth-error">{error}</div>
            )}
            <button
              className="btn btn-primary"
              id="auth-google-btn"
              style={{ width: '100%' }}
              disabled={submitting}
              onClick={handleGoogleSignIn}
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '8px' }}>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.5 0-14 4.2-17.7 10.7z"/>
                <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5C29.4 34.7 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.9 39.7 16.4 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.5 5.5C39.4 37.2 44 31.2 44 24c0-1.3-.1-2.7-.4-3.5z"/>
              </svg>
              {submitting ? 'Opening browser…' : 'Sign in with Google'}
            </button>
          </div>
        ) : (
          <div id="auth-signedin">
            <div className="ob-icon" style={{ fontSize: '36px' }}>☁️</div>
            <p id="auth-user-email" style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{user.email}</p>
            <p id="auth-plan-badge" className={isPro ? 'pro' : ''}>{isPro ? 'Pro' : 'Free'}</p>
            <button
              className="btn btn-secondary"
              id="auth-signout-btn"
              style={{ width: '100%' }}
              onClick={handleSignOut}
            >Sign Out</button>
          </div>
        )}
        <button
          className="btn btn-ghost"
          id="auth-close-btn"
          style={{ fontSize: '11px', marginTop: '4px' }}
          onClick={handleClose}
        >Close</button>
      </div>
    </div>
  )
}
