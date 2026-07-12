import { useAppContext } from '../../store/AppContext'
import { useAuthContext } from '../../store/AuthContext'
import { Toggle } from '../../components/Toggle'
import { isSupabaseConfigured } from '../../lib/supabase'

const SENSITIVITY_STAGES = [
  { label: 'Very Sensitive', value: 0.010 },
  { label: 'Sensitive',      value: 0.070 },
  { label: 'Balanced',       value: 0.130 },
  { label: 'Relaxed',        value: 0.190 },
  { label: 'Lenient',        value: 0.250 },
] as const

const THRESHOLD_MIN = 0.010
const THRESHOLD_MAX = 0.250

interface SettingsPanelProps {
  onRecalibrate: () => void
}

export function SettingsPanel({ onRecalibrate }: SettingsPanelProps) {
  const { state, dispatch } = useAppContext()
  const { user, isPro, signOut } = useAuthContext()
  const { showSettings, settings, threshold } = state

  const activeStage = SENSITIVITY_STAGES.find(s => Math.abs(s.value - threshold) < 0.001)
  const dotPct = ((threshold - THRESHOLD_MIN) / (THRESHOLD_MAX - THRESHOLD_MIN)) * 100

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
              <small>Tap a level to set sensitivity, or calibrate for a custom value</small>
            </div>
            <div className="sensitivity-track-wrap">
              <div className="sensitivity-labels">
                {SENSITIVITY_STAGES.map(stage => (
                  <button
                    key={stage.value}
                    className={`sensitivity-label${activeStage?.value === stage.value ? ' active' : ''}`}
                    onClick={() => handleThreshold(String(stage.value))}
                  >
                    {stage.label}
                  </button>
                ))}
              </div>
              <div className="sensitivity-track">
                <div className="sensitivity-dot-wrap" style={{ left: `${dotPct}%` }}>
                  <div className="sensitivity-dot" />
                  <span className="sensitivity-threshold-label">{threshold.toFixed(3)}</span>
                </div>
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

        {isSupabaseConfigured && user && (
          <div className="settings-group" id="settings-account">
            <div className="settings-row" id="settings-account-in">
              <div className="settings-row-label">
                <span id="settings-account-email">{user.email}</span>
                <small id="settings-account-plan">{isPro ? 'Pro Plan' : 'Free Plan'}</small>
              </div>
              <button
                className="btn btn-secondary"
                id="settings-signout-btn"
                style={{ fontSize: '11px', padding: '5px 12px', flexShrink: 0 }}
                onClick={handleSignOut}
              >Sign Out</button>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '10px', color: 'var(--text-faint)' }}>
          🔒 All processing is local
        </div>
      </div>
    </div>
  )
}
