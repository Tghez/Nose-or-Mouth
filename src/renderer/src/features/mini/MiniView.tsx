import { useAppContext } from '../../store/AppContext'

export function MiniView() {
  const { state } = useAppContext()
  const { mouthOpen, faceDetected, lipsOccluded, paused, noseSeconds, mouthSeconds } = state

  const active = !paused && faceDetected && !lipsOccluded
  const isMouth = active && mouthOpen
  const isNose  = active && !mouthOpen

  const total    = noseSeconds + mouthSeconds
  const nosePct  = total > 0 ? Math.round((noseSeconds / total) * 100) : 0
  const mouthPct = total > 0 ? 100 - nosePct : 0

  const stateClass   = isMouth ? 'state-mouth' : isNose ? 'state-nose' : 'state-none'
  const emoji        = isMouth ? '👄' : '👃'
  const nosePctStr   = total > 0 ? `${nosePct}%` : '—'
  const mouthPctStr  = total > 0 ? `${mouthPct}%` : '—'

  function handleExpand() {
    window.electronAPI.exitMiniMode()
  }

  return (
    <div id="mini-view" className={stateClass}>
      <div id="mini-icon-wrap">
        <div id="mini-pulse" />
        <span id="mini-label">{emoji}</span>
      </div>
      <div id="mini-ratio">
        <div id="mini-bar">
          <div id="mini-bar-fill" style={{ width: `${nosePct}%` }} />
        </div>
        <div id="mini-bar-labels">
          <span>Nose {nosePctStr}</span>
          <span>Mouth {mouthPctStr}</span>
        </div>
      </div>
      <button id="mini-expand" onClick={handleExpand} title="Expand to full view">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8.5 1.5H12.5V5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5.5 12.5H1.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12.5 1.5L8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M1.5 12.5L6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}
