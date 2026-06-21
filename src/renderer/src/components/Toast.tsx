import { useEffect, useRef, useLayoutEffect } from 'react'
import { useAppContext } from '../store/AppContext'

export function Toast() {
  const { state, dispatch } = useAppContext()
  const toastRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useLayoutEffect(() => {
    if (!state.toastMessage || !toastRef.current) return
    const el = toastRef.current
    el.textContent = state.toastMessage
    el.classList.remove('show')
    void el.offsetWidth // force reflow so animation replays
    el.classList.add('show')
  }, [state.toastMessage])

  useEffect(() => {
    if (!state.toastMessage) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      dispatch({ type: 'SET_TOAST', payload: null })
    }, 3000)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [state.toastMessage]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div id="toast" ref={toastRef}></div>
}
