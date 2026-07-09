import { useEffect, useRef } from 'react'
import { useAppContext } from '../store/AppContext'

const THRESHOLD     = 0.9
const MOUTH_PULSE_S = 1.1  // CSS pulse-mouth animation duration
const NOSE_PULSE_S  = 1.8  // CSS pulse-nose animation duration

export function useAlerts() {
  const { state, dispatch } = useAppContext()

  // Simple per-window counters — reset when the window period expires
  const mouthCountRef  = useRef(0)
  const noseCountRef   = useRef(0)
  const windowStartRef = useRef(0)  // 0 = "never started"; first tick initialises it

  const alertFiredRef = useRef(false)

  // Stable refs so the animationiteration handler always reads latest values
  const mouthOpenRef  = useRef(state.mouthOpen)
  const enabledRef    = useRef(state.settings.alertEnabled ?? true)
  const windowSecsRef = useRef(state.settings.alertWindowSeconds ?? 120)

  useEffect(() => { mouthOpenRef.current  = state.mouthOpen                         }, [state.mouthOpen])
  useEffect(() => { enabledRef.current    = state.settings.alertEnabled ?? true      }, [state.settings.alertEnabled])
  useEffect(() => { windowSecsRef.current = state.settings.alertWindowSeconds ?? 120 }, [state.settings.alertWindowSeconds])

  // processTickRef is refreshed every render so dispatch/state are never stale
  const processTickRef = useRef(() => {})
  useEffect(() => {
    processTickRef.current = () => {
      if (!enabledRef.current) return

      const now           = Date.now()
      const windowSeconds = windowSecsRef.current
      const windowMs      = windowSeconds * 1000
      const mouthSegs     = Math.round(windowSeconds / MOUTH_PULSE_S)
      const noseSegs      = Math.round(windowSeconds / NOSE_PULSE_S)

      // windowStartRef starts at 0, so the very first tick always initialises
      // a clean window from the moment detection is actually running.
      if (windowStartRef.current === 0) {
        windowStartRef.current = now
      }

      if (mouthOpenRef.current) mouthCountRef.current++
      else noseCountRef.current++

      let fired = false

      // Only evaluate and fire once the full window has actually elapsed in real
      // time. Nose and mouth pulses tick at different cadences (NOSE_PULSE_S vs
      // MOUTH_PULSE_S), so checking the ratio on every tick let a fast-ticking
      // mode cross 90% well before the configured window duration had passed.
      if (now - windowStartRef.current >= windowMs) {
        const mp = mouthCountRef.current / mouthSegs
        const np = noseCountRef.current  / noseSegs
        const winMins = Math.round(windowSeconds / 60)

        if (mp >= THRESHOLD) {
          window.electronAPI.showNotification({
            title: 'Mouth Breather Alert',
            body: `You've been mouth breathing for most of the last ${winMins} min — try breathing through your nose!`,
          })
          fired = true
        } else if (np >= THRESHOLD) {
          window.electronAPI.showNotification({
            title: 'Great work! 🌿',
            body: `You've been breathing through your nose for the last ${winMins} min. Keep it up!`,
          })
          fired = true
        }

        mouthCountRef.current  = 0
        noseCountRef.current   = 0
        windowStartRef.current = now
      }

      alertFiredRef.current = fired

      dispatch({
        type: 'SET_CLOCK_STATE',
        payload: {
          mouthClockFilled:   Math.min(mouthCountRef.current, mouthSegs),
          noseClockFilled:    Math.min(noseCountRef.current,  noseSegs),
          mouthClockSegments: mouthSegs,
          noseClockSegments:  noseSegs,
          alertFired:         alertFiredRef.current,
          alertWindowStartMs: windowStartRef.current,
        },
      })
    }
  })

  // Attach once — stable wrapper always calls the fresh processTickRef
  useEffect(() => {
    const el = document.getElementById('pulse-ring')
    if (!el) return
    const handler = () => processTickRef.current()
    el.addEventListener('animationiteration', handler)
    return () => el.removeEventListener('animationiteration', handler)
  }, [])

  function doReset(): void {
    mouthCountRef.current  = 0
    noseCountRef.current   = 0
    windowStartRef.current = Date.now()
    alertFiredRef.current  = false
    const windowSeconds = windowSecsRef.current
    dispatch({
      type: 'SET_CLOCK_STATE',
      payload: {
        mouthClockFilled:        0,
        noseClockFilled:         0,
        mouthClockSegments:      Math.round(windowSeconds / MOUTH_PULSE_S),
        noseClockSegments:       Math.round(windowSeconds / NOSE_PULSE_S),
        alertFired:        false,
        alertWindowStartMs: 0,
      },
    })
  }

  return { resetAlertWindow: doReset, pauseAlertWindow: doReset }
}
