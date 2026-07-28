import { useAppContext } from '../../store/AppContext'

// 120×120 SVG, center at (60,60). Ring sits between the resting pulse-ring (32px)
// and its max shadow extent (~58px), snug around the emoji.
const R_INNER   = 44    // inner edge of bars from SVG center (SVG units = px)
const BAR_H     = 6     // radial bar height (tick-mark style)
const FIXED_GAP = 0.5   // constant gap between bars regardless of numSegs

// Each bar represents 2 confirmed real seconds, so one bar fills per pulse
// cycle (pulse-ring keyframes in styles.css are 2s). Window-progress
// bookkeeping in useAlerts.ts (elapsed-seconds text, notification timing)
// stays in real seconds and is untouched by this — only the visual grouping
// changes here.
const SECONDS_PER_BAR = 2

function barWidth(numSegs: number): number {
  if (numSegs <= 0) return 0
  const slotArc = (2 * Math.PI * R_INNER) / numSegs
  return Math.max(0.5, slotArc - FIXED_GAP)
}

function cornerRadius(bw: number): number {
  return Math.min(bw / 2, 1)
}

export function ClockRing() {
  const { state } = useAppContext()
  const {
    faceDetected, lipsOccluded, paused,
    clockFilled, clockSegments, clockColors,
    settings,
  } = state

  const alertEnabled = settings.alertEnabled ?? true
  const isActive     = !paused && faceDetected && !lipsOccluded

  if (!alertEnabled || clockSegments === 0 || !isActive) return null

  const barCount   = Math.max(1, Math.ceil(clockSegments / SECONDS_PER_BAR))
  const barsFilled = Math.floor(clockFilled / SECONDS_PER_BAR)

  const emptyColor = 'rgba(255,255,255,0.10)'
  const bw = barWidth(barCount)
  const rx = cornerRadius(bw)

  return (
    <svg
      id="clock-ring-svg"
      width="120"
      height="120"
      viewBox="0 0 120 120"
    >
      {Array.from({ length: barCount }, (_, i) => {
        const isFilled  = i < barsFilled
        const barType   = isFilled ? clockColors[i * SECONDS_PER_BAR + SECONDS_PER_BAR - 1] : undefined
        const color     = barType === 'mouth' ? 'var(--mouth-color)' : 'var(--nose-color)'
        const theta     = i * (360 / barCount)
        // rotate around SVG center (60,60), then translate the pivot to the inner ring edge
        const transform = `rotate(${theta} 60 60) translate(60 ${60 - R_INNER})`

        return (
          <g key={`${i}-${isFilled}`} transform={transform}>
            <rect
              x={-bw / 2}
              y={-BAR_H}
              width={bw}
              height={BAR_H}
              rx={rx}
              ry={rx}
              fill={isFilled ? color : emptyColor}
              className={
                isFilled
                  ? `clock-bar clock-bar-filled clock-bar-${barType}`
                  : 'clock-bar'
              }
              style={{ transformOrigin: '50% 100%' }}
            />
          </g>
        )
      })}
    </svg>
  )
}
