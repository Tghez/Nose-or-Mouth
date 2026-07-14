import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useAppContext } from '../store/AppContext'
import {
  getFaceLandmarker,
  getHandLandmarker,
  getLipOpenRatio,
  isLipsOccluded,
  drawFaceMesh,
  clearFaceMesh,
} from '../lib/mediapipe'
import type { CalibrationRefs } from './useCalibration'
import type { FaceLandmarkerResult, HandLandmarkerResult } from '@mediapipe/tasks-vision'

const BUFFER_SIZE = 3

// If the camera + detector are both ready but not one single face has been
// found in this long, the video pipeline likely came up in a bad state
// (seen on some Windows webcams — dimensions report ready before real frames
// are flowing). Restarting the stream once is what manually toggling the
// camera off/on does, and reliably clears it.
const STUCK_NO_FACE_MS = 6000

export function useDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  faceCanvasRef: RefObject<HTMLCanvasElement | null>,
  calibrationRefs: CalibrationRefs,
  onStuckNoFace: () => void,
  onFrame: (mouthOpen: boolean | null) => void
): void {
  const { state, dispatch } = useAppContext()

  // Mutable refs for hot-path reads — zero GC pressure in the rAF loop
  const cameraReadyRef  = useRef(state.cameraReady)
  const mpReadyRef      = useRef(state.mediapipeReady)
  const thresholdRef    = useRef(state.threshold)
  const faceMeshRef     = useRef(state.faceMeshVisible)
  const ratioBufferRef  = useRef<number[]>([])
  const noFaceTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const faceDetectedRef = useRef(false)
  const lipsOccludedRef = useRef(false)

  // Boot-time stuck-pipeline watchdog. `watchdogFiredRef` is one-shot for the
  // whole app run (not per camera session) so a legitimate "no face in frame
  // yet" state — e.g. the user starts the app before sitting down — can never
  // trigger a restart loop; it only ever auto-recovers the first bad pipeline.
  const readySinceRef    = useRef<number | null>(null)
  const watchdogFiredRef = useRef(false)
  const onStuckNoFaceRef = useRef(onStuckNoFace)
  useEffect(() => { onStuckNoFaceRef.current = onStuckNoFace }, [onStuckNoFace])

  const onFrameRef = useRef(onFrame)
  useEffect(() => { onFrameRef.current = onFrame }, [onFrame])

  useEffect(() => { thresholdRef.current    = state.threshold    }, [state.threshold])
  useEffect(() => { faceMeshRef.current     = state.faceMeshVisible }, [state.faceMeshVisible])

  useEffect(() => {
    cameraReadyRef.current = state.cameraReady
    // New camera session: restart the "how long has this session gone
    // without a face" clock and forget any face seen in the previous session.
    readySinceRef.current = null
    faceDetectedRef.current = false
  }, [state.cameraReady])

  useEffect(() => { mpReadyRef.current = state.mediapipeReady }, [state.mediapipeReady])

  // Single rAF loop started once for the app lifetime
  useEffect(() => {
    let lastSendTime = 0
    let cancelled = false

    function loop(): void {
      if (cancelled) return
      requestAnimationFrame(loop)
      if (!cameraReadyRef.current || !mpReadyRef.current) return
      const now = Date.now()
      if (readySinceRef.current === null) readySinceRef.current = now
      if (
        !watchdogFiredRef.current &&
        !faceDetectedRef.current &&
        now - readySinceRef.current > STUCK_NO_FACE_MS
      ) {
        watchdogFiredRef.current = true
        console.warn('No face detected within', STUCK_NO_FACE_MS, 'ms of camera start — restarting camera')
        onStuckNoFaceRef.current()
        return
      }
      if (now - lastSendTime < 200) return
      lastSendTime = now
      const video = videoRef.current
      if (!video || video.readyState < 2 || video.videoWidth === 0) return
      const fl = getFaceLandmarker()
      if (!fl) return
      try {
        const ts = performance.now()
        const faceResults = fl.detectForVideo(video, ts)
        const handResults = getHandLandmarker()?.detectForVideo(video, ts) ?? null
        handleResults(faceResults, handResults)
      } catch (err) {
        console.error('detectForVideo error:', err)
      }
    }

    loop()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleResults(
    results: FaceLandmarkerResult,
    handResults: HandLandmarkerResult | null
  ): void {
    const canvas = faceCanvasRef.current
    const video  = videoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d')

    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
      if (ctx) clearFaceMesh(ctx, canvas)
      handleNoFace()
      onFrameRef.current(null)
      return
    }

    handleFaceDetected()

    if (ctx && faceMeshRef.current) {
      drawFaceMesh(ctx, canvas, video, results)
    } else if (ctx) {
      clearFaceMesh(ctx, canvas)
    }

    const lm = results.faceLandmarks[0]
    if (handResults && isLipsOccluded(lm, handResults)) {
      if (!lipsOccludedRef.current) ratioBufferRef.current = []
      lipsOccludedRef.current = true
      dispatch({ type: 'SET_DETECTION_STATE', payload: { mouthOpen: false, faceDetected: true, lipsOccluded: true, paused: false } })
      dispatch({ type: 'SET_STATUS', payload: 'Lips covered — waiting' })
      window.electronAPI.updateTrayIcon('none')
      onFrameRef.current(null)
      return
    }
    if (lipsOccludedRef.current) ratioBufferRef.current = []
    lipsOccludedRef.current = false

    const ratio = getLipOpenRatio(results)
    const mouthOpen = classifyMouth(ratio)

    // Update calibration display and push samples when calibration is active
    if (calibrationRefs.activeRef.current) {
      calibrationRefs.onRatioUpdate(ratio)
      if (calibrationRefs.collectingRef.current) {
        calibrationRefs.samplesRef.current.push(ratio)
      }
    }

    dispatch({ type: 'SET_DETECTION_STATE', payload: { mouthOpen, faceDetected: true, lipsOccluded: false, paused: false } })
    window.electronAPI.updateTrayIcon(mouthOpen ? 'mouth' : 'nose')
    onFrameRef.current(mouthOpen)
  }

  function classifyMouth(ratio: number): boolean {
    const buf = ratioBufferRef.current
    buf.push(ratio)
    if (buf.length > BUFFER_SIZE) buf.shift()
    const avg = buf.reduce((a, b) => a + b, 0) / buf.length
    return avg > thresholdRef.current
  }

  function handleNoFace(): void {
    if (faceDetectedRef.current) {
      faceDetectedRef.current = false
      dispatch({ type: 'SET_DETECTION_STATE', payload: { mouthOpen: false, faceDetected: false, lipsOccluded: false, paused: false } })
      if (!noFaceTimerRef.current) {
        noFaceTimerRef.current = setTimeout(() => {
          noFaceTimerRef.current = null
          dispatch({ type: 'SET_DETECTION_STATE', payload: { mouthOpen: false, faceDetected: false, lipsOccluded: false, paused: true } })
          dispatch({ type: 'SET_STATUS', payload: 'No face detected — paused' })
          window.electronAPI.updateTrayIcon('none')
        }, 10000)
      }
    }
  }

  function handleFaceDetected(): void {
    if (noFaceTimerRef.current) {
      clearTimeout(noFaceTimerRef.current)
      noFaceTimerRef.current = null
    }
    if (!faceDetectedRef.current) {
      faceDetectedRef.current = true
      dispatch({ type: 'SET_STATUS', payload: 'Detecting…' })
    }
  }


}
