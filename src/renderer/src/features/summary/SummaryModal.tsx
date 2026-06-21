import { useState, useEffect } from 'react'
import { useAppContext } from '../../store/AppContext'
import { useAuthContext } from '../../store/AuthContext'
import type { WeekSession } from '../../store/AuthContext'
import { formatTime } from '../../lib/utils'
import { DonutChart } from './DonutChart'
import { WeekBarChart } from './WeekBarChart'

export function SummaryModal() {
  const { state, dispatch } = useAppContext()
  const { isPro, fetchWeekSessions } = useAuthContext()
  const { showSummary, summaryData } = state

  const [tab, setTab]             = useState<'day' | 'week'>('day')
  const [weekData, setWeekData]   = useState<WeekSession[] | null>(null)
  const [weekLoading, setWeekLoading] = useState(false)

  // Reset week cache every time the modal opens so data is always fresh
  useEffect(() => {
    if (showSummary) {
      setTab('day')
      setWeekData(null)
      setWeekLoading(false)
    }
  }, [showSummary])

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
    const fetched = await fetchWeekSessions()
    // Always use summaryData for today — Supabase may not have it yet
    const merged = [
      ...fetched.filter(s => s.date !== date),
      { date, noseSeconds, mouthSeconds },
    ].sort((a, b) => a.date.localeCompare(b.date))
    setWeekData(merged)
    setWeekLoading(false)
  }

  return (
    <div id="summary-modal" className={`overlay${showSummary ? '' : ' hidden'}`}>
      <h2>Daily Summary</h2>
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

      <button
        className="btn btn-primary"
        id="summary-close-btn"
        style={{ width: '100%', maxWidth: '200px' }}
        onClick={() => dispatch({ type: 'HIDE_MODAL', payload: 'summary' })}
      >
        Done
      </button>
    </div>
  )
}
