import { useEffect, useRef } from 'react'
import { useAppContext } from '../store/AppContext'

const DISPLAY_MS = 4000

// In-app encouragement for sustained nose breathing — deliberately not an OS
// notification (silent), shown as a card in the full window or overlaid on
// the compact mini window when minimized.
export function NoseFlash() {
  const { state, dispatch } = useAppContext()
  const { noseFlash, isMiniMode } = state
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!noseFlash) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      dispatch({ type: 'SET_NOSE_FLASH', payload: null })
    }, DISPLAY_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [noseFlash]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!noseFlash) return null

  return (
    <div key={noseFlash.id} id="nose-flash" className={isMiniMode ? 'mini show' : 'show'}>
      <span id="nose-flash-icon">🌿</span>
      <div id="nose-flash-text">
        <span id="nose-flash-title">Nose Breathing</span>
        <span id="nose-flash-body">{noseFlash.message}</span>
      </div>
    </div>
  )
}
