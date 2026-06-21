import type { RefObject } from 'react'
import { useAppContext } from '../../store/AppContext'
import { Toggle } from '../../components/Toggle'
import { clearFaceMesh } from '../../lib/mediapipe'

interface CameraSectionProps {
  videoRef: RefObject<HTMLVideoElement | null>
  faceCanvasRef: RefObject<HTMLCanvasElement | null>
  onToggleCamera: () => void
}

export function CameraSection({ videoRef, faceCanvasRef, onToggleCamera }: CameraSectionProps) {
  const { state, dispatch } = useAppContext()

  function handleOverlayChange(checked: boolean): void {
    dispatch({ type: 'SET_FACE_MESH_VISIBLE', payload: checked })
    if (!checked && faceCanvasRef.current) {
      const ctx = faceCanvasRef.current.getContext('2d')
      if (ctx) clearFaceMesh(ctx, faceCanvasRef.current)
    }
  }

  const faceDetected = state.faceDetected
  const cameraEnabled = state.cameraEnabled

  const wrapClass = cameraEnabled
    ? (faceDetected ? 'face-ok' : '')
    : ''

  const badgeText  = (!cameraEnabled || faceDetected) ? '' : '● No Face detected'
  const badgeClass = (!cameraEnabled || faceDetected) ? '' : 'face-missing'
  const dotClass   = !cameraEnabled ? '' : faceDetected ? 'detecting' : 'no-face'

  return (
    <div id="camera-section">
      <div id="camera-wrap" className={wrapClass}>
        <video
          id="video"
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ visibility: cameraEnabled ? undefined : 'hidden' }}
        />
        <canvas id="face-canvas" ref={faceCanvasRef} width={320} height={180} />
        {!cameraEnabled && (
          <div id="camera-off-placeholder">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor" style={{ opacity: 0.3 }}>
              <path d="M3.27,2L2,3.27L4.73,6C4.27,6.13 4,6.5 4,7V17A1,1 0 0,0 5,18H17.73L19.73,20L21,18.73L3.27,2M17,10.5L21,6.5V17.5L17,13.5V17C17,17.55 16.55,18 16,18H6.27L8.27,16H16V11.27L17,12.27V10.5M16,6A1,1 0 0,1 17,7V8.18L19,6.18V7L17,9V10.5L15,8.5V7H13L11,5H16Z"/>
            </svg>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px' }}>Camera off</div>
          </div>
        )}
        <div id="status-dot" className={dotClass}></div>
        <div id="face-badge" className={badgeClass}>{badgeText}</div>
      </div>
      <div id="camera-controls">
        <div className="cam-toggle-item">
          <span className="cam-toggle-label">Overlay</span>
          <Toggle bw checked={state.faceMeshVisible} onChange={handleOverlayChange} />
        </div>
        <div className="cam-toggle-item">
          <span className="cam-toggle-label">Camera</span>
          <Toggle bw checked={cameraEnabled} onChange={onToggleCamera} />
        </div>
      </div>
    </div>
  )
}
