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

  // Tracks a nose/mouth state switch that hasn't been confirmed sustained yet.
  // Since mouthOpen is boolean, a flip while a switch is already pending can
  // only be a return to the state we started from (preSwitchStateRef) — that
  // cancels the pending switch outright rather than arming a new one, so
  // briefly dipping into the other state and coming straight back never
  // resets anything, no matter how long you then stay back at baseline.
  const SWITCH_CONFIRM_MS   = 5000
  const pendingSwitchRef    = useRef(false)
  const preSwitchStateRef   = useRef(false)
  const switchTimeRef       = useRef(0)
  const switchMouthCountRef = useRef(0)
  const switchNoseCountRef  = useRef(0)

  // Stable refs so the animationiteration handler always reads latest values
  const mouthOpenRef  = useRef(state.mouthOpen)
  const enabledRef    = useRef(state.settings.alertEnabled ?? true)
  const windowSecsRef = useRef(state.settings.alertWindowSeconds ?? 120)

  useEffect(() => {
    if (state.mouthOpen !== mouthOpenRef.current) {
      if (pendingSwitchRef.current) {
        // Back to preSwitchStateRef already (only two possible states) —
        // this was a brief dip, not a sustained switch. Cancel it.
        pendingSwitchRef.current = false
      } else {
        pendingSwitchRef.current    = true
        preSwitchStateRef.current   = mouthOpenRef.current
        switchTimeRef.current       = Date.now()
        switchMouthCountRef.current = 0
        switchNoseCountRef.current  = 0
      }
    }
    mouthOpenRef.current = state.mouthOpen
  }, [state.mouthOpen])
  useEffect(() => { enabledRef.current    = state.settings.alertEnabled ?? true      }, [state.settings.alertEnabled])
  useEffect(() => { windowSecsRef.current = state.settings.alertWindowSeconds ?? 120 }, [state.settings.alertWindowSeconds])

  // Start the window the instant detection actually goes active, rather than
  // waiting on the first #pulse-ring animationiteration (up to 1.1-1.8s later).
  // Guarded by windowStartRef === 0 so this only fires the very first time.
  const isActive = !state.paused && state.faceDetected && !state.lipsOccluded
  useEffect(() => {
    if (!isActive || windowStartRef.current !== 0) return
    windowStartRef.current = Date.now()
    const windowSeconds = windowSecsRef.current
    dispatch({
      type: 'SET_CLOCK_STATE',
      payload: {
        mouthClockFilled:   0,
        noseClockFilled:    0,
        mouthClockSegments: Math.round(windowSeconds / MOUTH_PULSE_S),
        noseClockSegments:  Math.round(windowSeconds / NOSE_PULSE_S),
        alertFired:         false,
        alertWindowStartMs: windowStartRef.current,
      },
    })
  }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps

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

      // If the state switched and has now held steady for SWITCH_CONFIRM_MS,
      // treat it as a genuine mode change: start a fresh window backdated by
      // that confirm period so the old state's history stops diluting the
      // ratio, without discarding the ticks already seen in the new state.
      if (pendingSwitchRef.current) {
        if (mouthOpenRef.current) switchMouthCountRef.current++
        else switchNoseCountRef.current++

        if (now - switchTimeRef.current >= SWITCH_CONFIRM_MS) {
          mouthCountRef.current   = switchMouthCountRef.current
          noseCountRef.current    = switchNoseCountRef.current
          windowStartRef.current  = now - SWITCH_CONFIRM_MS
          pendingSwitchRef.current = false
        }
      }

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

  // Delegate to document instead of the #pulse-ring element directly: on first
  // mount the app is still showing the sign-in/boot screen, so #pulse-ring
  // doesn't exist yet. animationiteration bubbles, so listening on document
  // (which always exists) means the handler works whenever #pulse-ring later
  // mounts, instead of silently never attaching.
  useEffect(() => {
    const handler = (e: AnimationEvent) => {
      if ((e.target as HTMLElement | null)?.id !== 'pulse-ring') return
      processTickRef.current()
    }
    document.addEventListener('animationiteration', handler)
    return () => document.removeEventListener('animationiteration', handler)
  }, [])

  function doReset(): void {
    mouthCountRef.current  = 0
    noseCountRef.current   = 0
    windowStartRef.current = Date.now()
    alertFiredRef.current  = false
    pendingSwitchRef.current    = false
    preSwitchStateRef.current   = false
    switchMouthCountRef.current = 0
    switchNoseCountRef.current  = 0
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
