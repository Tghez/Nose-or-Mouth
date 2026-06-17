import { useRef, useEffect } from 'react'
import { drawDonut } from '../../lib/mediapipe'

interface DonutChartProps {
  nosePct: number
  mouthPct: number
}

export function DonutChart({ nosePct, mouthPct }: DonutChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) {
      drawDonut(canvasRef.current, nosePct, mouthPct)
    }
  }, [nosePct, mouthPct])

  return <canvas id="donut-chart" width={140} height={140} ref={canvasRef} />
}
