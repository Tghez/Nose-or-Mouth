import { useEffect, useRef } from 'react'
import { useAppContext } from '../store/AppContext'
import { buildSummaryBody } from '../lib/utils'

export function useIpc(persistSession: (dateOverride?: string) => Promise<void>, isPro: boolean) {
  const { dispatch } = useAppContext()
  const persistRef = useRef(persistSession)
  useEffect(() => { persistRef.current = persistSession }, [persistSession])
  const isProRef = useRef(isPro)
  useEffect(() => { isProRef.current = isPro }, [isPro])

  // Summary Time only controls when the notification/modal is shown — it never
  // resets the counters. The actual day boundary is real local midnight (see
  // onDayReset below), so this always persists under "today".
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
    })

    return () => { window.electronAPI.removeAllListeners('daily-summary-trigger') }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fires once at real local midnight. Finalizes the outgoing day under its
  // own date (not "today", which has already rolled over) before resetting,
  // so counters never carry over into the new day's storage entry.
  useEffect(() => {
    window.electronAPI.onDayReset(async ({ previousDate }) => {
      await persistRef.current(previousDate)
      dispatch({ type: 'RESET_DAY' })
    })

    return () => { window.electronAPI.removeAllListeners('day-reset-trigger') }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
