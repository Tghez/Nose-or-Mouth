import { useState } from 'react'
import { useAppContext } from '../../store/AppContext'
import { useAuthContext } from '../../store/AuthContext'

export function AuthModal() {
  const { state, dispatch } = useAppContext()
  const { user, isPro, signIn, signUp, signOut } = useAuthContext()
  const { showAuthModal } = state

  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [errorStyle, setErrorStyle] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)

  function setTab(signup: boolean): void {
    setIsSignUp(signup)
    setError(null)
    setErrorStyle(undefined)
  }

  async function handleSubmit(): Promise<void> {
    if (!email.trim() || !password) return
    setSubmitting(true)
    setError(null)
    setErrorStyle(undefined)

    const err = isSignUp ? await signUp(email, password) : await signIn(email, password)

    if (err) {
      setError(err)
    } else if (isSignUp) {
      setError('Check your email to confirm your account.')
      setErrorStyle('var(--nose-color)')
    } else {
      dispatch({ type: 'HIDE_MODAL', payload: 'auth' })
    }
    setSubmitting(false)
  }

  async function handleSignOut(): Promise<void> {
    await signOut()
    dispatch({ type: 'HIDE_MODAL', payload: 'auth' })
  }

  return (
    <div id="auth-modal" className={`overlay${showAuthModal ? '' : ' hidden'}`}>
      <div id="auth-card">
        {!user ? (
          <div id="auth-signedout">
            <div id="auth-tabs">
              <button
                className={`auth-tab${!isSignUp ? ' active' : ''}`}
                id="tab-signin"
                onClick={() => setTab(false)}
              >Sign In</button>
              <button
                className={`auth-tab${isSignUp ? ' active' : ''}`}
                id="tab-signup"
                onClick={() => setTab(true)}
              >Create Account</button>
            </div>
            <p id="auth-info">Sign in to enable cloud sync across devices.</p>
            {error && (
              <div id="auth-error" style={errorStyle ? { color: errorStyle } : undefined}>
                {error}
              </div>
            )}
            <input
              type="email"
              id="auth-email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <input
              type="password"
              id="auth-password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button
              className="btn btn-primary"
              id="auth-submit-btn"
              style={{ width: '100%' }}
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting
                ? (isSignUp ? 'Creating…' : 'Signing in…')
                : (isSignUp ? 'Create Account' : 'Sign In')}
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
          onClick={() => dispatch({ type: 'HIDE_MODAL', payload: 'auth' })}
        >Close</button>
      </div>
    </div>
  )
}
