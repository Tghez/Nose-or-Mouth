import { useAppContext } from '../../store/AppContext'
import { formatTime } from '../../lib/utils'

export function StatsSection() {
  const { state } = useAppContext()
  const { noseSeconds, mouthSeconds } = state

  const total = noseSeconds + mouthSeconds
  const nosePct  = total > 0 ? Math.round((noseSeconds / total) * 100) : 0
  const mouthPct = total > 0 ? 100 - nosePct : 0

  return (
    <div id="stats-section">
      <div id="stats-row">
        <div className="stat-item nose">
          <div className="stat-icon">👃</div>
          <div className="stat-value" id="nose-time">{formatTime(noseSeconds)}</div>
          <div className="stat-label">Nose</div>
        </div>
        <div className="stat-item mouth">
          <div className="stat-icon">👄</div>
          <div className="stat-value" id="mouth-time">{formatTime(mouthSeconds)}</div>
          <div className="stat-label">Mouth</div>
        </div>
      </div>

      <div id="ratio-bar-wrap">
        <div id="ratio-bar">
          <div id="ratio-fill" style={{ width: total > 0 ? nosePct + '%' : '0%' }}></div>
        </div>
        <div id="ratio-labels">
          <span id="nose-pct-label">{total > 0 ? nosePct + '% nose' : '—%'}</span>
          <span id="mouth-pct-label">{total > 0 ? mouthPct + '% mouth' : '—%'}</span>
        </div>
      </div>
    </div>
  )
}
