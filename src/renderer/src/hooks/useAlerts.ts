import { useRef } from 'react'
import { useAppContext } from '../store/AppContext'

export function useAlerts() {
  const { state, dispatch } = useAppContext()

  const alertWindowStartTimeRef      = useRef<number | null>(null)
  const alertWindowMouthSecondsRef   = useRef(0)
  const alertWindowTotalSecondsRef   = useRef(0)
  const alertFiredRef                = useRef(false)

  // Keep settings refs in sync for hot-path reads
  const alertEnabledRef              = useRef(state.settings.alertEnabled ?? true)
  const alertWindowSecondsRef        = useRef(state.settings.alertWindowSeconds ?? 600)
  const alertProportionThresholdRef  = useRef(state.settings.alertProportionThreshold ?? 0.8)

  // Called every second from useCounters when detecting
  function tickAlertWindow(mouthOpen: boolean): void {
    const enabled = state.settings.alertEnabled ?? true
    const windowSeconds = state.settings.alertWindowSeconds ?? 600
    const proportionThreshold = state.settings.alertProportionThreshold ?? 0.8

    alertEnabledRef.current = enabled
    alertWindowSecondsRef.current = windowSeconds
    alertProportionThresholdRef.current = proportionThreshold

    if (!enabled) return

    if (alertWindowStartTimeRef.current === null) {
      alertWindowStartTimeRef.current = Date.now()
      alertWindowMouthSecondsRef.current = 0
      alertWindowTotalSecondsRef.current = 0
    }

    alertWindowTotalSecondsRef.current++
    if (mouthOpen) alertWindowMouthSecondsRef.current++

    const elapsed = (Date.now() - alertWindowStartTimeRef.current) / 1000
    if (elapsed >= windowSeconds) {
      const total = alertWindowTotalSecondsRef.current
      const proportion = total > 0 ? alertWindowMouthSecondsRef.current / total : 0

      if (proportion >= proportionThreshold && !alertFiredRef.current) {
        alertFiredRef.current = true
        const pct = Math.round(proportion * 100)
        const winMins = windowSeconds / 60
        window.electronAPI.showNotification({
          title: 'Mouth Breather Alert',
          body: `${pct}% mouth breathing in the last ${winMins} min — try nose breathing!`
        })
        dispatch({ type: 'SET_ALERT_STATE', payload: { alertFired: true, alertWindowTotalSeconds: alertWindowTotalSecondsRef.current } })
      }

      alertWindowStartTimeRef.current = Date.now()
      alertWindowMouthSecondsRef.current = 0
      alertWindowTotalSecondsRef.current = 0
      alertFiredRef.current = false
    }

    dispatch({ type: 'SET_ALERT_STATE', payload: { alertFired: alertFiredRef.current, alertWindowTotalSeconds: alertWindowTotalSecondsRef.current } })
  }

  function resetAlertWindow(): void {
    alertWindowStartTimeRef.current = null
    alertWindowMouthSecondsRef.current = 0
    alertWindowTotalSecondsRef.current = 0
    alertFiredRef.current = false
    dispatch({ type: 'SET_ALERT_STATE', payload: { alertFired: false, alertWindowTotalSeconds: 0 } })
  }

  function pauseAlertWindow(): void {
    alertWindowStartTimeRef.current = null
    alertWindowMouthSecondsRef.current = 0
    alertWindowTotalSecondsRef.current = 0
  }

  return { tickAlertWindow, resetAlertWindow, pauseAlertWindow }
}
