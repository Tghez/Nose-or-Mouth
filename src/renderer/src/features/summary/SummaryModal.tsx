import { useAppContext } from '../../store/AppContext'
import { formatTime } from '../../lib/utils'
import { DonutChart } from './DonutChart'

export function SummaryModal() {
  const { state, dispatch } = useAppContext()
  const { showSummary, summaryData } = state

  if (!summaryData) return null

  const { date, noseSeconds, mouthSeconds, streak } = summaryData
  const total    = noseSeconds + mouthSeconds
  const nosePct  = total > 0 ? Math.round((noseSeconds / total) * 100) : 0
  const mouthPct = 100 - nosePct

  const streakText = streak > 0
    ? `🔥 ${streak} day${streak !== 1 ? 's' : ''} in a row with <20% mouth breathing`
    : ''

  const isGoodDay = nosePct >= 80
  const messageText  = isGoodDay ? 'Great day! 🎉' : 'Room to improve 💪'
  const messageClass = isGoodDay ? '' : 'warn'

  return (
    <div id="summary-modal" className={`overlay${showSummary ? '' : ' hidden'}`}>
      <h2>Daily Summary</h2>
      <div id="summary-date">{date}</div>

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
