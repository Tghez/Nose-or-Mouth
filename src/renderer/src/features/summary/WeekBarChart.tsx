import type { WeekSession } from '../../../../types/session'

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

function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const NICE_HOUR_STEPS = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24]

function niceMaxSeconds(maxSeconds: number): number {
  const maxHours = maxSeconds / 3600
  const step = NICE_HOUR_STEPS.find(s => s >= maxHours) ?? Math.ceil(maxHours)
  return step * 3600
}

export function WeekBarChart({ sessions }: Props) {
  const slots = buildSlots()
  const byDate = new Map(sessions.map(s => [s.date, s]))

  const totals = slots.map(date => {
    const s = byDate.get(date)
    return s ? s.noseSeconds + s.mouthSeconds : 0
  })
  const axisMax = niceMaxSeconds(Math.max(...totals, 1))

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
      <div className="week-chart-wrap">
        <div className="week-axis">
          <div className="week-axis-scale">
            <span className="week-axis-label">{formatDuration(axisMax)}</span>
            <span className="week-axis-label">{formatDuration(axisMax / 2)}</span>
            <span className="week-axis-label">0</span>
          </div>
          <div className="week-axis-spacer" />
        </div>
        <div className="week-chart">
          {slots.map(date => {
            const s = byDate.get(date)
            const total = s ? s.noseSeconds + s.mouthSeconds : 0
            const heightPct = (total / axisMax) * 100
            const nosePct   = total > 0 ? (s!.noseSeconds  / total) * 100 : 0
            const mouthPct  = total > 0 ? (s!.mouthSeconds / total) * 100 : 0

            return (
              <div key={date} className="week-bar-group">
                <div className="week-bar-track" title={total > 0 ? formatDuration(total) : 'No data'}>
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
      </div>
      {avgNosePct !== null && (
        <div className="week-avg">7-day avg nose: {avgNosePct}%</div>
      )}
    </div>
  )
}
