'use strict'

function localDateString() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function computeStreak(sessions) {
  if (!sessions || sessions.length === 0) return 0
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date))
  let streak = 0
  const today = localDateString()

  for (const s of sorted) {
    if (s.date > today) continue
    const total = (s.noseBreathingSeconds || 0) + (s.mouthBreathingSeconds || 0)
    if (total === 0) break
    const mouthPct = (s.mouthBreathingSeconds || 0) / total
    if (mouthPct < 0.20) {
      streak++
    } else {
      break
    }
  }
  return streak
}

function startScheduler(store, getWindow, storage) {
  // Poll every 10s — a 60s interval can miss the target minute entirely
  // depending on when the app started and the interval's phase offset.
  setInterval(() => {
    const now = new Date()
    const summaryTime = store.get('summaryTime', '18:00')
    const [targetH, targetM] = summaryTime.split(':').map(Number)

    if (now.getHours() !== targetH || now.getMinutes() !== targetM) return

    // Use local date so users in UTC+ timezones (e.g. Israel, UTC+3)
    // get the correct date instead of the previous UTC date.
    const today = localDateString()
    if (store.get('lastSummaryDate') === today) return

    store.set('lastSummaryDate', today)

    const session = storage.getSession(today)
    const allSessions = storage.readAll()
    const streak = computeStreak(allSessions)

    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('daily-summary-trigger', {
        date: today,
        noseSeconds: (session && session.noseBreathingSeconds) || 0,
        mouthSeconds: (session && session.mouthBreathingSeconds) || 0,
        streak
      })
    }
  }, 10 * 1000)
}

module.exports = { startScheduler, computeStreak, localDateString }
