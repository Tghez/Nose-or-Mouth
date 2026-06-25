import { useRef } from 'react'
import type { RefObject } from 'react'
import { useAppContext } from '../store/AppContext'

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const { dispatch } = useAppContext()
  const activeStreamRef = useRef<MediaStream | null>(null)

  async function startCamera(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 960 },
          facingMode: { ideal: 'user' },
        }
      })
      activeStreamRef.current = stream

      // Detect unexpected camera loss (e.g. macOS screen sleep revokes access)
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          // activeStreamRef is nulled first in stopCamera — if it's still set here,
          // the track ended unexpectedly (system sleep, camera unplugged, etc.)
          if (activeStreamRef.current !== null) {
            activeStreamRef.current = null
            const videoEl = videoRef.current
            if (videoEl) videoEl.srcObject = null
            dispatch({ type: 'SET_CAMERA_READY', payload: false })
            dispatch({ type: 'SET_CAMERA_ENABLED', payload: false })
            dispatch({ type: 'SET_DETECTION_STATE', payload: { mouthOpen: false, faceDetected: false, lipsOccluded: false, paused: true } })
            dispatch({ type: 'SET_STATUS', payload: 'Camera disconnected — tap 📷 to restart' })
          }
        }, { once: true })
      }

      const videoEl = videoRef.current as HTMLVideoElement
      videoEl.srcObject = stream

      await new Promise<void>((resolve, reject) => {
        videoEl.onloadedmetadata = () => {
          videoEl.play().then(resolve).catch(reject)
        }
        videoEl.onerror = reject
      })

      // On macOS, videoWidth can stay 0 briefly after play() resolves while the
      // first frame is decoded. Poll until a real frame is available (max 3s).
      if (videoEl.videoWidth === 0) {
        await new Promise<void>((resolve) => {
          let attempts = 0
          const check = () => {
            if (videoEl.videoWidth > 0 || attempts++ > 30) resolve()
            else setTimeout(check, 100)
          }
          check()
        })
      }

      dispatch({ type: 'SET_CAMERA_READY', payload: true })
      return true
    } catch (err) {
      dispatch({ type: 'SET_STATUS', payload: 'Camera unavailable: ' + (err as Error).message })
      return false
    }
  }

  function stopCamera(noFaceTimerRef: RefObject<ReturnType<typeof setTimeout> | null>): void {
    if (noFaceTimerRef.current) {
      clearTimeout(noFaceTimerRef.current)
      noFaceTimerRef.current = null
    }
    // Null the ref BEFORE stopping tracks so the 'ended' listener treats this as intentional
    const stream = activeStreamRef.current
    activeStreamRef.current = null
    stream?.getTracks().forEach(t => t.stop())
    const videoEl = videoRef.current
    if (videoEl) videoEl.srcObject = null
    dispatch({ type: 'SET_CAMERA_READY', payload: false })
    dispatch({ type: 'SET_CAMERA_ENABLED', payload: false })
    dispatch({ type: 'SET_DETECTION_STATE', payload: { mouthOpen: false, faceDetected: false, lipsOccluded: false, paused: true } })
    dispatch({ type: 'SET_STATUS', payload: 'Camera off' })
  }

  async function toggleCamera(
    cameraEnabled: boolean,
    noFaceTimerRef: RefObject<ReturnType<typeof setTimeout> | null>
  ): Promise<void> {
    if (cameraEnabled) {
      stopCamera(noFaceTimerRef)
    } else {
      dispatch({ type: 'SET_CAMERA_ENABLED', payload: true })
      const ok = await startCamera()
      if (ok) {
        dispatch({ type: 'SET_STATUS', payload: 'Detecting…' })
      } else {
        dispatch({ type: 'SET_CAMERA_ENABLED', payload: false })
      }
    }
  }

  return { startCamera, stopCamera, toggleCamera }
}
