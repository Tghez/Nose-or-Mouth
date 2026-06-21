import { useAppContext } from '../../store/AppContext'
import { Toggle } from '../../components/Toggle'
import { formatMS } from '../../lib/utils'

interface AlertPopupProps {
  onReset: () => void
  onShowToast: (msg: string) => void
}

export function AlertPopup({ onReset, onShowToast }: AlertPopupProps) {
  const { state, dispatch } = useAppContext()
  const { showAlertPopup, settings, alertWindowTotalSeconds } = state

  const alertEnabled = settings.alertEnabled ?? true
  const alertWindowSeconds = settings.alertWindowSeconds ?? 600
  const alertProportionThreshold = settings.alertProportionThreshold ?? 0.8
  const thresholdPct = Math.round(alertProportionThreshold * 100)

  function close(): void {
    dispatch({ type: 'HIDE_MODAL', payload: 'alert' })
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

  function handleThresholdChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const pct = parseInt(e.target.value, 10)
    saveSetting({ alertProportionThreshold: pct / 100 })
    onReset()
  }

  function handleSnooze(): void {
    onReset()
    onShowToast('Alert window reset ✓')
  }

  const counterText = (!alertEnabled || alertWindowTotalSeconds === 0)
    ? '—'
    : formatMS(alertWindowTotalSeconds)

  return (
    <>
      <div
        id="alert-backdrop"
        className={showAlertPopup ? '' : 'hidden'}
        onClick={close}
      />
      <div id="alert-popup" className={showAlertPopup ? '' : 'hidden'}>
        <div id="alert-popup-header">
          <span>Breathing Alert</span>
          <button id="alert-popup-close" onClick={close}>✕</button>
        </div>
        <div id="alert-popup-desc">
          Get notified when you breathe through your mouth too much within a set time window. The alert fires once per window if the mouth-breathing proportion exceeds your threshold.
        </div>
        <div className="alert-row" id="alert-counter-row">
          <div className="alert-row-label">
            <span>Window Progress</span>
            <small>Time elapsed in current window</small>
          </div>
          <span id="alert-window-counter">{counterText}</span>
        </div>
        <div className="alert-row">
          <label className="alert-row-label" htmlFor="alert-enabled-toggle">
            <span>Alerts Enabled</span>
          </label>
          <Toggle
            id="alert-enabled-toggle"
            checked={alertEnabled}
            onChange={handleEnabledChange}
          />
        </div>
        <div id="alert-controls" className={alertEnabled ? '' : 'disabled'}>
          <div className="alert-row">
            <div className="alert-row-label">
              <span>Time Window</span>
              <small>Rolling period to measure</small>
            </div>
            <select
              id="alert-window-select"
              value={alertWindowSeconds}
              onChange={handleWindowChange}
            >
              <option value="300">5 min</option>
              <option value="600">10 min</option>
              <option value="900">15 min</option>
              <option value="1800">30 min</option>
            </select>
          </div>
          <div className="alert-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
            <div className="alert-row-label">
              <span>Mouth % Threshold</span>
              <small>Alert if mouth breathing exceeds</small>
            </div>
            <div className="settings-slider-wrap" style={{ width: '100%' }}>
              <div className="settings-slider-row">
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', width: '32px' }}>1%</span>
                <input
                  type="range"
                  id="alert-threshold-select"
                  min="1"
                  max="100"
                  step="1"
                  value={thresholdPct}
                  onChange={handleThresholdChange}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', width: '40px', textAlign: 'right' }}>100%</span>
              </div>
              <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-dim)' }}>
                Threshold: <span id="alert-threshold-display">{thresholdPct}%</span>
              </div>
            </div>
          </div>
          <div className="alert-row">
            <div className="alert-row-label">
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
    </>
  )
}
