import { useRef } from 'react'
import { useAppContext } from '../store/AppContext'

interface ToolbarProps {
  onSummaryClick: () => Promise<void>
}

export function Toolbar({ onSummaryClick }: ToolbarProps) {
  const { state, dispatch } = useAppContext()
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function flashBtn(el: HTMLElement): void {
    el.classList.remove('tb-flash')
    void el.offsetWidth // force reflow
    el.classList.add('tb-flash')
    el.addEventListener('animationend', () => el.classList.remove('tb-flash'), { once: true })
  }

  function handleBtnClick(e: React.MouseEvent<HTMLButtonElement>): void {
    flashBtn(e.currentTarget)
  }

  return (
    <div id="toolbar">
      <button
        className={`tb-btn${state.activeTab === 'settings' ? ' active' : ''}`}
        id="tb-settings"
        onClick={e => {
          handleBtnClick(e)
          dispatch({ type: 'SET_ACTIVE_TAB', payload: 'settings' })
        }}
      >
        <svg className="tb-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M19.14,12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54C14.46,2.18,14.25,2,14,2h-3.84c-.24,0-.43.17-.47.41l-.36,2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47,0-.59.22L2.74,8.87c-.12.21-.08.47.12.61l2.03,1.58C4.77,10.81,4.73,11.14,4.73,11.47s.02.64.07.94l-2.03,1.58c-.18.14-.23.41-.12.61l1.92,3.32c.12.22.37.29.59.22l2.39-.96c.5.38,1.03.7,1.62.94l.36,2.54c.05.24.24.41.48.41h3.84c.24,0,.44-.17.47-.41l.36-2.54c.59-.24,1.13-.56,1.62-.94l2.39.96c.22.08.47,0,.59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6,3.6,1.62,3.6,3.6-1.62,3.6-3.6,3.6z"/>
        </svg>
        <span className="tb-label">Settings</span>
      </button>
      <button
        className={`tb-btn${state.activeTab === 'summary' ? ' active' : ''}`}
        id="tb-summary"
        onClick={async e => {
          handleBtnClick(e)
          await onSummaryClick()
        }}
      >
        <svg className="tb-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z"/>
        </svg>
        <span className="tb-label">Summary</span>
      </button>
      <button
        className={`tb-btn${state.alertFired && (state.settings.alertEnabled ?? true) ? ' alert-fired' : ''}${state.activeTab === 'alert' ? ' active' : ''}`}
        id="tb-alert"
        onClick={e => {
          handleBtnClick(e)
          dispatch({ type: 'SET_ACTIVE_TAB', payload: 'alert' })
        }}
      >
        <svg className="tb-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M21,19V20H3V19L5,17V11C5,7.9 7.03,5.17 10,4.29C10,4.19 10,4.1 10,4A2,2 0 0,1 12,2A2,2 0 0,1 14,4C14,4.1 14,4.19 14,4.29C16.97,5.17 19,7.9 19,11V17L21,19M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21"/>
        </svg>
        <span className="tb-label">Alert</span>
      </button>
    </div>
  )
}
