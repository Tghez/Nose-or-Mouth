import { useAppContext } from '../../store/AppContext'
import { useAuthContext } from '../../store/AuthContext'
import { Toggle } from '../../components/Toggle'
import { isSupabaseConfigured } from '../../lib/supabase'

interface SettingsPanelProps {
  onRecalibrate: () => void
  onSignInClick: () => void
}

export function SettingsPanel({ onRecalibrate, onSignInClick }: SettingsPanelProps) {
  const { state, dispatch } = useAppContext()
  const { user, isPro, signOut } = useAuthContext()
  const { showSettings, settings, threshold } = state

  function saveSetting(partial: Partial<typeof settings>): void {
    window.electronAPI.saveSettings(partial)
    dispatch({ type: 'SET_SETTINGS', payload: partial })
  }

  function handleLightMode(checked: boolean): void {
    document.body.classList.toggle('light', checked)
    saveSetting({ lightMode: checked })
  }

  function handleThreshold(val: string): void {
    const n = parseFloat(val)
    dispatch({ type: 'SET_THRESHOLD', payload: n })
    saveSetting({ threshold: n })
  }

  function handleSignOut(): void {
    signOut()
  }

  return (
    <div id="settings-panel" className={showSettings ? '' : 'hidden'}>
      <div id="settings-header">
        <h2>Settings</h2>
        <button
          className="btn btn-ghost"
          id="settings-close-btn"
          style={{ padding: '4px 8px', fontSize: '18px' }}
          onClick={() => dispatch({ type: 'HIDE_MODAL', payload: 'settings' })}
        >✕</button>
      </div>

      <div id="settings-body">
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-label">
              <span>Light Mode</span>
              <small>Switch to a light color scheme</small>
            </div>
            <Toggle
              id="setting-light-mode"
              checked={!!settings.lightMode}
              onChange={handleLightMode}
            />
          </div>
          <div className="settings-row">
            <div className="settings-row-label">
              <span>Always on Top</span>
              <small>Keep the window above other apps</small>
            </div>
            <Toggle
              id="setting-always-on-top"
              checked={!!settings.alwaysOnTop}
              onChange={checked => saveSetting({ alwaysOnTop: checked })}
            />
          </div>
          <div className="settings-row">
            <div className="settings-row-label">
              <span>Start at Login</span>
              <small>Launch automatically on startup</small>
            </div>
            <Toggle
              id="setting-start-at-login"
              checked={!!settings.startAtLogin}
              onChange={checked => saveSetting({ startAtLogin: checked })}
            />
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
            <div className="settings-row-label">
              <span>Detection Sensitivity</span>
              <small>Lower = more sensitive (triggers easier)</small>
            </div>
            <div className="settings-slider-wrap">
              <div className="settings-slider-row">
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', width: '40px' }}>Low</span>
                <input
                  type="range"
                  id="setting-threshold"
                  min="0.01"
                  max="0.25"
                  step="0.005"
                  value={threshold}
                  onChange={e => handleThreshold(e.target.value)}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', width: '40px', textAlign: 'right' }}>High</span>
              </div>
              <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-dim)' }}>
                Threshold: <span id="threshold-display">{threshold.toFixed(3)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-label">
              <span>Daily Summary Time</span>
              <small>When to show today's summary</small>
            </div>
            <input
              type="time"
              id="setting-summary-time"
              value={settings.summaryTime ?? '18:00'}
              onChange={e => saveSetting({ summaryTime: e.target.value })}
            />
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
            <span>Re-run Calibration</span>
            <button
              className="btn btn-secondary"
              id="recalibrate-btn"
              style={{ width: '100%' }}
              onClick={onRecalibrate}
            >
              Calibrate Detection Threshold
            </button>
          </div>
        </div>

        {isSupabaseConfigured && (
          <div className="settings-group" id="settings-account">
            {!user ? (
              <div className="settings-row" id="settings-account-out">
                <div className="settings-row-label">
                  <span>Account</span>
                  <small>Sign in to enable cloud sync</small>
                </div>
                <button
                  className="btn btn-secondary"
                  id="settings-signin-btn"
                  style={{ fontSize: '11px', padding: '5px 12px', flexShrink: 0 }}
                  onClick={onSignInClick}
                >Sign In</button>
              </div>
            ) : (
              <div className="settings-row" id="settings-account-in">
                <div className="settings-row-label">
                  <span id="settings-account-email">{user.email}</span>
                  <small id="settings-account-plan">{isPro ? 'Pro — cloud sync enabled' : 'Free plan'}</small>
                </div>
                <button
                  className="btn btn-secondary"
                  id="settings-signout-btn"
                  style={{ fontSize: '11px', padding: '5px 12px', flexShrink: 0 }}
                  onClick={handleSignOut}
                >Sign Out</button>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '10px', color: 'var(--text-faint)' }}>
          🔒 All processing is local
        </div>
      </div>
    </div>
  )
}
