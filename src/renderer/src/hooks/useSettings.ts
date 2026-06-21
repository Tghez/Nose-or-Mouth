import { useEffect } from 'react'
import { useAppContext } from '../store/AppContext'
import type { StoreSchema } from '../../../types/session'

export function useSettings() {
  const { dispatch } = useAppContext()

  async function loadSettings(): Promise<StoreSchema> {
    const s = await window.electronAPI.getSettings()

    const stored = s.threshold ?? 0.07
    const isStale = stored >= 0.2 || stored < 0.04
    if (isStale) await window.electronAPI.saveSettings({ calibrated: false, threshold: 0.07 })
    const effective = isStale ? 0.07 : stored

    dispatch({ type: 'SET_SETTINGS', payload: { ...s, threshold: effective } })
    dispatch({ type: 'SET_THRESHOLD', payload: effective })

    const lightMode = !!s.lightMode
    document.body.classList.toggle('light', lightMode)

    return { ...s, threshold: effective }
  }

  useEffect(() => {
    window.electronAPI.onSettingsChanged((newSettings) => {
      dispatch({ type: 'SET_SETTINGS', payload: newSettings })
      dispatch({ type: 'SET_THRESHOLD', payload: newSettings.threshold ?? 0.07 })
      document.body.classList.toggle('light', !!newSettings.lightMode)
    })
    return () => { window.electronAPI.removeAllListeners('settings-changed') }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { loadSettings }
}
