import { useAppContext } from '../../store/AppContext'

// 120×120 SVG, center at (60,60). Ring sits between the resting pulse-ring (32px)
// and its max shadow extent (~58px), snug around the emoji.
const R_INNER   = 44    // inner edge of bars from SVG center (SVG units = px)
const BAR_H     = 6     // radial bar height (tick-mark style)
const FIXED_GAP = 0.5   // constant gap between bars regardless of numSegs

function barWidth(numSegs: number): number {
  const slotArc = (2 * Math.PI * R_INNER) / numSegs
  return Math.max(0.5, slotArc - FIXED_GAP)
}

function cornerRadius(bw: number): number {
  return Math.min(bw / 2, 1)
}

export function ClockRing() {
  const { state } = useAppContext()
  const {
    mouthOpen, faceDetected, lipsOccluded, paused,
    mouthClockFilled, noseClockFilled, mouthClockSegments, noseClockSegments,
    settings,
  } = state

  const alertEnabled = settings.alertEnabled ?? true
  const isActive     = !paused && faceDetected && !lipsOccluded
  const numSegs      = mouthOpen ? mouthClockSegments : noseClockSegments

  if (!alertEnabled || numSegs === 0 || !isActive) return null

  const filled     = mouthOpen ? mouthClockFilled : noseClockFilled
  const barType    = mouthOpen ? 'mouth' : 'nose'
  const color      = mouthOpen ? 'var(--mouth-color)' : 'var(--nose-color)'
  const emptyColor = 'rgba(255,255,255,0.10)'
  const bw      = barWidth(numSegs)
  const rx      = cornerRadius(bw)

  return (
    <svg
      id="clock-ring-svg"
      width="120"
      height="120"
      viewBox="0 0 120 120"
    >
      {Array.from({ length: numSegs }, (_, i) => {
        const isFilled  = i < filled
        const theta     = i * (360 / numSegs)
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
