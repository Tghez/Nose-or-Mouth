import type Store from 'electron-store'
import type { BrowserWindow } from 'electron'
import type { StoreSchema, SummaryData } from '../../types/session'
import type { readAll, getSession } from './storage'

export function localDateString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function computeStreak(sessions: Array<{ date: string; noseBreathingSeconds?: number; mouthBreathingSeconds?: number }>): number {
  if (!sessions || sessions.length === 0) return 0
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date))
  let streak = 0
  const today = localDateString()

  for (const s of sorted) {
    if (s.date > today) continue
    const total = (s.noseBreathingSeconds ?? 0) + (s.mouthBreathingSeconds ?? 0)
    if (total === 0) break
    const mouthPct = (s.mouthBreathingSeconds ?? 0) / total
    if (mouthPct < 0.20) {
      streak++
    } else {
      break
    }
  }
  return streak
}

type StorageModule = { readAll: typeof readAll; getSession: typeof getSession }

export function startScheduler(
  store: Store<StoreSchema>,
  getWindow: () => BrowserWindow | null,
  storage: StorageModule
): void {
  setInterval(() => {
    const now = new Date()
    const summaryTime = store.get('summaryTime', '18:00') as string
    const [targetH, targetM] = summaryTime.split(':').map(Number)

    if (now.getHours() !== targetH || now.getMinutes() !== targetM) return

    const today = localDateString()
    if (store.get('lastSummaryDate') === today) return

    store.set('lastSummaryDate', today)

    const session = storage.getSession(today)
    const allSessions = storage.readAll()
    const streak = computeStreak(allSessions)

    const win = getWindow()
    if (win && !win.isDestroyed()) {
      const payload: SummaryData = {
        date: today,
        noseSeconds: session?.noseBreathingSeconds ?? 0,
        mouthSeconds: session?.mouthBreathingSeconds ?? 0,
        streak
      }
      win.webContents.send('daily-summary-trigger', payload)
    }
  }, 10 * 1000)
}
