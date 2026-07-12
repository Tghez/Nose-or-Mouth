import { useEffect, useRef } from 'react'
import { useAppContext } from '../store/AppContext'
import { useAuthContext } from '../store/AuthContext'
import { todayString } from '../lib/utils'

const FREE_DAILY_LIMIT_SECONDS = 600

export function useCounters(
  pauseAlertWindow: () => void
) {
  const { state, dispatch } = useAppContext()
  const { isPro } = useAuthContext()

  // Stable refs for the interval callback — avoids recreating interval on every render
  const mouthOpenRef    = useRef(state.mouthOpen)
  const faceDetectedRef = useRef(state.faceDetected)
  const lipsOccludedRef = useRef(state.lipsOccluded)
  const pausedRef       = useRef(state.paused)
  const isProRef        = useRef(isPro)
  const limitReachedRef = useRef(false)

  // Counter values in refs too — interval closure reads them directly
  const noseSecondsRef  = useRef(state.noseSeconds)
  const mouthSecondsRef = useRef(state.mouthSeconds)
  const baseNoseRef     = useRef(state.baseNoseSeconds)
  const baseMouthRef    = useRef(state.baseMouthSeconds)
  const sessionStartRef = useRef(state.sessionStart)

  useEffect(() => { mouthOpenRef.current    = state.mouthOpen    }, [state.mouthOpen])
  useEffect(() => { faceDetectedRef.current = state.faceDetected }, [state.faceDetected])
  useEffect(() => { lipsOccludedRef.current = state.lipsOccluded }, [state.lipsOccluded])
  useEffect(() => { pausedRef.current       = state.paused       }, [state.paused])
  useEffect(() => { isProRef.current        = isPro              }, [isPro])
  useEffect(() => { noseSecondsRef.current  = state.noseSeconds  }, [state.noseSeconds])
  useEffect(() => { mouthSecondsRef.current = state.mouthSeconds }, [state.mouthSeconds])
  useEffect(() => { baseNoseRef.current     = state.baseNoseSeconds  }, [state.baseNoseSeconds])
  useEffect(() => { baseMouthRef.current    = state.baseMouthSeconds }, [state.baseMouthSeconds])
  useEffect(() => { sessionStartRef.current = state.sessionStart }, [state.sessionStart])

  const saveDebounceRef = useRef(0)
  const pauseAlertRef   = useRef(pauseAlertWindow)

  useEffect(() => { pauseAlertRef.current = pauseAlertWindow }, [pauseAlertWindow])

  async function persistSession(): Promise<void> {
    if (!isProRef.current) return
    const payload = {
      date: todayString(),
      sessionStart: sessionStartRef.current,
      mouthBreathingSeconds: baseMouthRef.current + mouthSecondsRef.current,
      noseBreathingSeconds:  baseNoseRef.current  + noseSecondsRef.current,
    }
    await window.electronAPI.saveSession(payload)
  }

  const persistRef = useRef(persistSession)
  useEffect(() => { persistRef.current = persistSession })

  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current || !faceDetectedRef.current || lipsOccludedRef.current) {
        return
      }

      if (mouthOpenRef.current) {
        dispatch({ type: 'TICK_MOUTH' })
        mouthSecondsRef.current++
      } else {
        dispatch({ type: 'TICK_NOSE' })
        noseSecondsRef.current++
      }

      // Free-tier daily limit gate
      if (!limitReachedRef.current && !isProRef.current) {
        const totalToday =
          baseNoseRef.current  + baseMouthRef.current +
          noseSecondsRef.current + mouthSecondsRef.current
        if (totalToday >= FREE_DAILY_LIMIT_SECONDS) {
          limitReachedRef.current = true
          dispatch({ type: 'SET_DETECTION_STATE', payload: { mouthOpen: false, faceDetected: false, lipsOccluded: false, paused: true } })
          persistRef.current().catch(() => {})
          dispatch({ type: 'SHOW_MODAL', payload: 'limit' })
          return
        }
      }

      saveDebounceRef.current++
      if (saveDebounceRef.current >= 30) {
        saveDebounceRef.current = 0
        persistRef.current().catch(() => {})
      }
    }, 1000)

    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Expose resetLimitGate so AuthContext pro upgrade can clear it
  function resetLimitGate(): void {
    limitReachedRef.current = false
  }

  return { persistSession: () => persistRef.current(), resetLimitGate }
}
