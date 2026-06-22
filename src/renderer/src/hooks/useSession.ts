import { useAppContext } from '../store/AppContext'
import { todayString } from '../lib/utils'

const FREE_DAILY_LIMIT_SECONDS = 600

export function useSession() {
  const { dispatch } = useAppContext()

  async function restoreSession(isPro: boolean): Promise<void> {
    const sess = await window.electronAPI.getSession(todayString())
    const baseNose  = sess?.noseBreathingSeconds  ?? 0
    const baseMouth = sess?.mouthBreathingSeconds ?? 0
    dispatch({ type: 'SET_BASE_SECONDS', payload: { baseNoseSeconds: baseNose, baseMouthSeconds: baseMouth } })

    if (!isPro) {
      const total = baseNose + baseMouth
      if (total >= FREE_DAILY_LIMIT_SECONDS) {
        dispatch({ type: 'SET_DETECTION_STATE', payload: { mouthOpen: false, faceDetected: false, lipsOccluded: false, paused: true } })
        setTimeout(() => dispatch({ type: 'SHOW_MODAL', payload: 'limit' }), 800)
      }
    }
  }

  return { restoreSession }
}
