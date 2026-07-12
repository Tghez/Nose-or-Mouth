import { useState } from 'react'
import { useAuthContext } from '../../store/AuthContext'

// Only ever rendered while signed out (see App.tsx's `!user` gate) — sign-in
// is required to enter the app at all, so there is deliberately no way to
// dismiss this without completing Google sign-in.
export function AuthModal() {
  const { signInWithGoogle } = useAuthContext()

  const [error, setError]           = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleGoogleSignIn(): Promise<void> {
    setSubmitting(true)
    setError(null)

    const err = await signInWithGoogle()

    if (err) {
      setError(err)
      setSubmitting(false)
    }
    // On success the browser takes over; once the deep-link callback resolves
    // the session, App.tsx's `user` gate stops rendering this modal.
  }

  return (
    <div id="auth-modal" className="overlay">
      <div id="auth-card">
        <div id="auth-signedout">
          <p id="auth-info">Sign in with Google to continue.</p>
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
      </div>
    </div>
  )
}
