import { useEffect, useRef, useState } from 'react'
import { useAppContext } from '../../store/AppContext'

function playChime(): void {
  try {
    const ctx = new AudioContext()
    // Gentle ascending major chord: C5 → E5 → G5
    const notes = [523.25, 659.25, 783.99]
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.11
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.14, t + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
      osc.start(t)
      osc.stop(t + 0.55)
    })
    setTimeout(() => ctx.close(), 1000)
  } catch {}
}

const VISIBLE_MS  = 1600
const FADE_MS     = 400

export function AlertNotification() {
  const { state, dispatch } = useAppContext()
  const { alertNotification } = state
  const [fading, setFading] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!alertNotification) { setFading(false); return }

    playChime()

    fadeTimerRef.current = setTimeout(() => setFading(true), VISIBLE_MS)
    hideTimerRef.current = setTimeout(() => {
      dispatch({ type: 'HIDE_ALERT_NOTIFICATION' })
    }, VISIBLE_MS + FADE_MS)

    return () => {
      clearTimeout(fadeTimerRef.current!)
      clearTimeout(hideTimerRef.current!)
    }
  }, [alertNotification])

  useEffect(() => {
    if (!alertNotification) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dispatch({ type: 'HIDE_ALERT_NOTIFICATION' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [alertNotification])

  if (!alertNotification) return null

  return (
    <div id="alert-notif" className={fading ? 'fading' : ''}>
      <div id="alert-notif-title">{alertNotification.title}</div>
      <div id="alert-notif-body">{alertNotification.body}</div>
      <button
        id="alert-notif-close"
        onClick={() => dispatch({ type: 'HIDE_ALERT_NOTIFICATION' })}
        title="Close (Esc)"
      >
        ✕
      </button>
    </div>
  )
}
