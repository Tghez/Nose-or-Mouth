import { useEffect, useRef } from 'react'
import { useAppContext } from '../store/AppContext'

const THRESHOLD = 0.9

// A confirmed second requires 5 consecutive 200ms detection frames agreeing on
// the same state (5 * 200ms = 1s). Anything less is noise/flicker and gets
// discarded rather than banked, which naturally pauses window progress
// whenever detection is unstable.
const FRAMES_PER_SECOND = 5

export function useAlerts() {
  const { state, dispatch } = useAppContext()

  const enabledRef    = useRef(state.settings.alertEnabled ?? true)
  const windowSecsRef = useRef(state.settings.alertWindowSeconds ?? 120)
  const pausedRef     = useRef(state.paused)

  useEffect(() => { enabledRef.current = state.settings.alertEnabled ?? true }, [state.settings.alertEnabled])
  useEffect(() => { pausedRef.current  = state.paused }, [state.paused])

  // Consecutive same-state frame streak, used to confirm one banked second.
  const streakStateRef = useRef<boolean | null>(null)
  const streakCountRef = useRef(0)

  // Ordered list of confirmed seconds in the current window — length doubles
  // as the "filled" count, and each entry's color for rendering the ring.
  const clockColorsRef = useRef<('nose' | 'mouth')[]>([])

  function dispatchClockState(alertFired: boolean): void {
    dispatch({
      type: 'SET_CLOCK_STATE',
      payload: {
        clockFilled:    clockColorsRef.current.length,
        clockSegments:  windowSecsRef.current,
        clockColors:    [...clockColorsRef.current],
        alertFired,
      },
    })
  }

  // Keep windowSecsRef in sync with settings, seed clockSegments on mount, and
  // clamp any in-progress window if the user shrinks the window mid-session.
  useEffect(() => {
    windowSecsRef.current = state.settings.alertWindowSeconds ?? 120
    if (clockColorsRef.current.length > windowSecsRef.current) {
      clockColorsRef.current = clockColorsRef.current.slice(0, windowSecsRef.current)
    }
    dispatchClockState(false)
  }, [state.settings.alertWindowSeconds]) // eslint-disable-line react-hooks/exhaustive-deps

  function bankSecond(mouthOpen: boolean): void {
    const colors = clockColorsRef.current
    colors.push(mouthOpen ? 'mouth' : 'nose')

    let fired = false
    const segs = windowSecsRef.current

    if (colors.length >= segs) {
      const mouthCount = colors.filter((c) => c === 'mouth').length
      const mp = mouthCount / segs
      const np = (segs - mouthCount) / segs
      const winLabel = segs < 60 ? `${segs} sec` : `${Math.round(segs / 60)} min`

      if (mp >= THRESHOLD) {
        window.electronAPI.showNotification({
          title: 'Mouth Breather Alert',
          body: `You've been mouth breathing for most of the last ${winLabel} — try breathing through your nose!`,
        })
        fired = true
      } else if (np >= THRESHOLD) {
        // Nose breathing is encouraged in-app only (silent flash), not via OS notification.
        dispatch({
          type: 'SET_NOSE_FLASH',
          payload: {
            id: Date.now(),
            message: `You've been breathing through your nose for the last ${winLabel}. Keep it up!`,
          },
        })
        fired = true
      }

      clockColorsRef.current = []
    }

    dispatchClockState(fired)
  }

  function recordFrame(mouthOpen: boolean | null): void {
    if (!enabledRef.current) return

    if (mouthOpen === null || pausedRef.current) {
      streakStateRef.current = null
      streakCountRef.current = 0
      return
    }

    if (streakStateRef.current === mouthOpen) {
      streakCountRef.current++
    } else {
      streakStateRef.current = mouthOpen
      streakCountRef.current = 1
    }

    if (streakCountRef.current >= FRAMES_PER_SECOND) {
      streakCountRef.current = 0
      bankSecond(mouthOpen)
    }
  }

  function doReset(): void {
    streakStateRef.current = null
    streakCountRef.current = 0
    clockColorsRef.current = []
    dispatchClockState(false)
  }

  return { resetAlertWindow: doReset, pauseAlertWindow: doReset, recordFrame }
}
