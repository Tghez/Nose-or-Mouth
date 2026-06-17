import { useEffect, useRef } from 'react'
import { useAppContext } from '../store/AppContext'
import { buildSummaryBody } from '../lib/utils'

export function useIpc(persistSession: () => Promise<void>) {
  const { dispatch } = useAppContext()
  const persistRef = useRef(persistSession)
  useEffect(() => { persistRef.current = persistSession }, [persistSession])

  useEffect(() => {
    window.electronAPI.onDailySummaryTrigger(async (data) => {
      await persistRef.current()

      await window.electronAPI.showNotification({
        title: 'Mouth Breather Daily Summary',
        body: buildSummaryBody(data)
      })

      dispatch({ type: 'SET_SUMMARY_DATA', payload: data })
      dispatch({ type: 'SHOW_MODAL', payload: 'summary' })
      dispatch({ type: 'RESET_DAY' })
    })

    return () => { window.electronAPI.removeAllListeners('daily-summary-trigger') }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
