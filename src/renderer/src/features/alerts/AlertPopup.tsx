import { useAppContext } from '../../store/AppContext'
import { Toggle } from '../../components/Toggle'
import { formatMS } from '../../lib/utils'

interface AlertPopupProps {
  onReset: () => void
  onShowToast: (msg: string) => void
}

export function AlertPopup({ onReset, onShowToast }: AlertPopupProps) {
  const { state, dispatch } = useAppContext()
  const { settings, clockFilled, clockSegments } = state

  const alertEnabled = settings.alertEnabled ?? true
  const alertWindowSeconds = settings.alertWindowSeconds ?? 120

  function close(): void {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: null })
  }

  function saveSetting(partial: Partial<typeof settings>): void {
    window.electronAPI.saveSettings(partial)
    dispatch({ type: 'SET_SETTINGS', payload: partial })
  }

  function handleEnabledChange(checked: boolean): void {
    saveSetting({ alertEnabled: checked })
    if (!checked) onReset()
  }

  function handleWindowChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const val = parseInt(e.target.value, 10)
    saveSetting({ alertWindowSeconds: val })
    onReset()
  }

  function handleSnooze(): void {
    onReset()
    onShowToast('Alert window reset ✓')
  }

  const counterText = (!alertEnabled || clockSegments === 0)
    ? '—'
    : formatMS(clockFilled)

  return (
    <div id="alert-popup" className="tab-screen">
      <div id="alert-popup-header" className="tab-screen-header">
        <button className="tab-screen-close" id="alert-popup-close" onClick={close}>✕</button>
      </div>
      <div id="alert-popup-body" className="tab-screen-body">
        <div id="alert-popup-desc">
          Get notified if you're mouth breathing too much within your chosen time window.
        </div>

        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-label">
              <span>Alerts Enabled</span>
            </div>
            <Toggle
              id="alert-enabled-toggle"
              checked={alertEnabled}
              onChange={handleEnabledChange}
            />
          </div>
        </div>

        <div className={`settings-group${alertEnabled ? '' : ' disabled'}`} id="alert-controls">
          <div className="settings-row">
            <div className="settings-row-label">
              <span>Window Progress</span>
              <small>Seconds elapsed in current window</small>
            </div>
            <span id="alert-window-counter">{counterText}</span>
          </div>
          <div className="settings-row">
            <div className="settings-row-label">
              <span>Time Window</span>
              <small>Rolling period to measure</small>
            </div>
            <select
              id="alert-window-select"
              value={alertWindowSeconds}
              onChange={handleWindowChange}
            >
              <option value="60">1 min</option>
              <option value="120">2 min</option>
              <option value="180">3 min</option>
              <option value="240">4 min</option>
              <option value="300">5 min</option>
            </select>
          </div>
          <div className="settings-row">
            <div className="settings-row-label">
              <span>Reset timer</span>
              <small>Re-arm the alert for next cycle</small>
            </div>
            <button
              className="btn btn-secondary"
              id="alert-snooze-btn"
              style={{ fontSize: '11px', padding: '5px 12px' }}
              onClick={handleSnooze}
            >Reset</button>
          </div>
        </div>
      </div>
    </div>
  )
}
