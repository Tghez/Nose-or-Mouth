import { useAppContext } from '../../store/AppContext'

export function MiniView() {
  const { state } = useAppContext()
  const { mouthOpen, faceDetected, lipsOccluded, paused, cameraEnabled, noseSeconds, mouthSeconds } = state

  const cameraOff = !cameraEnabled
  const active = !cameraOff && !paused && faceDetected && !lipsOccluded
  const isMouth = active && mouthOpen
  const noFace  = !cameraOff && !active

  const total    = noseSeconds + mouthSeconds
  const nosePct  = total > 0 ? Math.round((noseSeconds / total) * 100) : 0
  const mouthPct = total > 0 ? 100 - nosePct : 0

  const stateClass   = cameraOff ? 'state-off' : noFace ? 'state-no-face' : isMouth ? 'state-mouth' : 'state-nose'
  const emoji        = isMouth ? '👄' : '👃'
  const nosePctStr   = total > 0 ? `${nosePct}%` : '—'
  const mouthPctStr  = total > 0 ? `${mouthPct}%` : '—'

  function handleExpand() {
    window.electronAPI.exitMiniMode()
  }

  return (
    <div id="mini-view" className={stateClass}>
      {noFace ? (
        <div id="mini-no-face-message">No face detection</div>
      ) : (
        <>
          <div id="mini-icon-wrap">
            <div id="mini-pulse" />
            {cameraOff ? (
              <svg id="mini-camera-off-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.27,2L2,3.27L4.73,6C4.27,6.13 4,6.5 4,7V17A1,1 0 0,0 5,18H17.73L19.73,20L21,18.73L3.27,2M17,10.5L21,6.5V17.5L17,13.5V17C17,17.55 16.55,18 16,18H6.27L8.27,16H16V11.27L17,12.27V10.5M16,6A1,1 0 0,1 17,7V8.18L19,6.18V7L17,9V10.5L15,8.5V7H13L11,5H16Z"/>
              </svg>
            ) : (
              <span id="mini-label">{emoji}</span>
            )}
          </div>
          <div id="mini-ratio">
            {cameraOff ? (
              <div id="mini-off-text">Camera off</div>
            ) : (
              <>
                <div id="mini-bar">
                  <div id="mini-bar-fill" style={{ width: `${nosePct}%` }} />
                </div>
                <div id="mini-bar-labels">
                  <span>Nose {nosePctStr}</span>
                  <span>Mouth {mouthPctStr}</span>
                </div>
              </>
            )}
          </div>
        </>
      )}
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
