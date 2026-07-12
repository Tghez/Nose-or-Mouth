import { useEffect, useRef } from 'react'
import { useAppContext } from '../store/AppContext'
import { buildSummaryBody } from '../lib/utils'

export function useIpc(persistSession: () => Promise<void>, isPro: boolean) {
  const { dispatch } = useAppContext()
  const persistRef = useRef(persistSession)
  useEffect(() => { persistRef.current = persistSession }, [persistSession])
  const isProRef = useRef(isPro)
  useEffect(() => { isProRef.current = isPro }, [isPro])

  useEffect(() => {
    window.electronAPI.onDailySummaryTrigger(async (data) => {
      await persistRef.current()

      await window.electronAPI.showNotification({
        title: 'Mouth Breather Daily Summary',
        body: buildSummaryBody(data)
      })

      if (isProRef.current) {
        dispatch({ type: 'SET_SUMMARY_DATA', payload: data })
        dispatch({ type: 'SHOW_MODAL', payload: 'summary' })
      } else {
        dispatch({ type: 'SHOW_MODAL', payload: 'summaryLocked' })
      }
      dispatch({ type: 'RESET_DAY' })
    })

    return () => { window.electronAPI.removeAllListeners('daily-summary-trigger') }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
