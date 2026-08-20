import { useState, useEffect } from 'react'
import { useAppContext } from '../../store/AppContext'
import { useAuthContext } from '../../store/AuthContext'
import type { WeekSession } from '../../../../types/session'
import { formatTime } from '../../lib/utils'
import { DonutChart } from './DonutChart'
import { WeekBarChart } from './WeekBarChart'

export function SummaryModal() {
  const { state, dispatch } = useAppContext()
  const { isPro } = useAuthContext()
  const { summaryData } = state

  const [tab, setTab]             = useState<'day' | 'week'>('day')
  const [weekData, setWeekData]   = useState<WeekSession[] | null>(null)
  const [weekLoading, setWeekLoading] = useState(false)

  // Reset week cache on every mount so data is always fresh (the panel
  // remounts each time the tab is switched to, since App.tsx only renders
  // it while activeTab === 'summary')
  useEffect(() => {
    setTab('day')
    setWeekData(null)
    setWeekLoading(false)
  }, [])

  if (!summaryData) return null

  const { date, noseSeconds, mouthSeconds, streak } = summaryData
  const [y, mo, d] = date.split('-').map(Number)
  const localDate  = new Date(y, mo - 1, d)
  const weekday    = localDate.toLocaleDateString('en-US', { weekday: 'long' })
  const fullDate   = localDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const total    = noseSeconds + mouthSeconds
  const nosePct  = total > 0 ? Math.round((noseSeconds / total) * 100) : 0
  const mouthPct = 100 - nosePct

  const streakText = streak > 0
    ? `🔥 ${streak} day${streak !== 1 ? 's' : ''} in a row with <20% mouth breathing`
    : ''

  const isGoodDay    = nosePct >= 80
  const messageText  = isGoodDay ? 'Great day! 🎉' : 'Room to improve 💪'
  const messageClass = isGoodDay ? '' : 'warn'

  async function handleWeekTab() {
    setTab('week')
    if (weekData !== null) return
    setWeekLoading(true)
    const all = await window.electronAPI.getAllSessions()
    const sevenDaysAgo = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10)
    const fetched: WeekSession[] = all
      .filter(s => s.date >= sevenDaysAgo)
      .map(s => ({ date: s.date, noseSeconds: s.noseBreathingSeconds, mouthSeconds: s.mouthBreathingSeconds }))
    // Always use summaryData for today — local file may not have today's tick yet
    const merged = [
      ...fetched.filter(s => s.date !== date),
      { date, noseSeconds, mouthSeconds },
    ].sort((a, b) => a.date.localeCompare(b.date))
    setWeekData(merged)
    setWeekLoading(false)
  }

  return (
    <div id="summary-modal" className="tab-screen">
      <div id="summary-header" className="tab-screen-header">
        <button
          className="tab-screen-close"
          id="summary-close-btn"
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: null })}
        >✕</button>
      </div>

      <div id="summary-body" className="tab-screen-body">
        <div id="summary-date">
          <span className="summary-date-weekday">{weekday}</span>
          <span className="summary-date-full">{fullDate}</span>
        </div>

        {isPro && (
          <div id="summary-tabs">
            <button
              className={`summary-tab${tab === 'day' ? ' active' : ''}`}
              onClick={() => setTab('day')}
            >
              Today
            </button>
            <button
              className={`summary-tab${tab === 'week' ? ' active' : ''}`}
              onClick={handleWeekTab}
            >
              7 Days
            </button>
          </div>
        )}

        <div className="summary-tab-body">
          {tab === 'day' && (
            <>
              <DonutChart nosePct={nosePct} mouthPct={mouthPct} />

              <div id="summary-legend">
                <div className="legend-item">
                  <div className="legend-dot nose"></div>
                  <span id="legend-nose-pct">{nosePct}% Nose</span>
                </div>
                <div className="legend-item">
                  <div className="legend-dot mouth"></div>
                  <span id="legend-mouth-pct">{mouthPct}% Mouth</span>
                </div>
              </div>

              <div id="summary-total">Total tracked: {formatTime(total)}</div>
              <div id="summary-streak">{streakText}</div>
              <div id="summary-message" className={messageClass}>{messageText}</div>
            </>
          )}

          {tab === 'week' && (
            weekLoading
              ? <div className="week-loading">Loading…</div>
              : <WeekBarChart sessions={weekData ?? []} />
          )}
        </div>
      </div>
    </div>
  )
}
