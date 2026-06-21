import type { WeekSession } from '../../store/AuthContext'

interface Props {
  sessions: WeekSession[]
}

function buildSlots(): string[] {
  const slots: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000)
    slots.push(d.toISOString().slice(0, 10))
  }
  return slots
}

function dayLabel(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
}

export function WeekBarChart({ sessions }: Props) {
  const slots = buildSlots()
  const byDate = new Map(sessions.map(s => [s.date, s]))

  const totals = slots.map(date => {
    const s = byDate.get(date)
    return s ? s.noseSeconds + s.mouthSeconds : 0
  })
  const maxTotal = Math.max(...totals, 1)

  const daysWithData = slots.filter(date => byDate.has(date))
  const avgNosePct = daysWithData.length === 0 ? null : Math.round(
    daysWithData.reduce((sum, date) => {
      const s = byDate.get(date)!
      const total = s.noseSeconds + s.mouthSeconds
      return sum + (total > 0 ? (s.noseSeconds / total) * 100 : 0)
    }, 0) / daysWithData.length
  )

  return (
    <div className="week-view">
      <div className="week-chart">
        {slots.map(date => {
          const s = byDate.get(date)
          const total = s ? s.noseSeconds + s.mouthSeconds : 0
          const heightPct = (total / maxTotal) * 100
          const nosePct   = total > 0 ? (s!.noseSeconds  / total) * 100 : 0
          const mouthPct  = total > 0 ? (s!.mouthSeconds / total) * 100 : 0

          return (
            <div key={date} className="week-bar-group">
              <div className="week-bar-track">
                <div className="week-bar-fill" style={{ height: `${heightPct}%` }}>
                  <div className="week-bar-mouth" style={{ flex: mouthPct }} />
                  <div className="week-bar-nose"  style={{ flex: nosePct  }} />
                </div>
              </div>
              <div className="week-bar-label">{dayLabel(date)}</div>
            </div>
          )
        })}
      </div>
      {avgNosePct !== null && (
        <div className="week-avg">7-day avg nose: {avgNosePct}%</div>
      )}
    </div>
  )
}
