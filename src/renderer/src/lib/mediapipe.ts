import { FaceLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { FaceLandmarkerResult, HandLandmarkerResult } from '@mediapipe/tasks-vision'

type Connection = { start: number; end: number }

let faceLandmarker: FaceLandmarker | null = null
let handLandmarker: HandLandmarker | null = null

export const MESH_FEATURES: Array<Connection[]> = []

export function getFaceLandmarker(): FaceLandmarker | null { return faceLandmarker }
export function getHandLandmarker(): HandLandmarker | null { return handLandmarker }

export async function initMediaPipe(): Promise<boolean> {
  try {
    const vision = await FilesetResolver.forVisionTasks('./mediapipe-wasm')
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: './mediapipe-wasm/face_landmarker.task',
        delegate: 'CPU',
      },
      outputFaceBlendshapes: false,
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.2,
      minTrackingConfidence: 0.2,
    })
    try {
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: './mediapipe-wasm/hand_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
    } catch (handErr) {
      console.warn('HandLandmarker init failed — lip occlusion detection disabled:', handErr)
    }
  } catch (err) {
    console.error('FaceLandmarker init error:', err)
    return false
  }

  MESH_FEATURES.length = 0
  MESH_FEATURES.push(
    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    FaceLandmarker.FACE_LANDMARKS_LIPS,
  )

  return true
}

// Lip-openness ratio: sensitive to partial openings, robust to yaw.
//
// WHY 2D eye-dist breaks at yaw: when the face turns sideways one eye moves
// behind the other in projection, so eyeDist_2D → 0 and the ratio spikes even
// with a closed mouth.
//
// WHY the 3-pair face-height approach broke half-open detection: averaging side
// pairs (82/87, 312/317) with the center pair (13/14) dilutes the signal —
// side pairs travel less vertically than center on a partial opening, and the
// face-height denominator is so large that partial openings produce ratios too
// small to distinguish from closed.
//
// Solution: center pair only (maximum sensitivity) + 3D inter-eye distance
// (yaw-stable: when the face turns, x-collapse is compensated by z-depth).
//   13 = upper inner lip center, 14 = lower inner lip center
//   33 = left eye medial canthus, 263 = right eye medial canthus
export function getLipOpenRatio(results: FaceLandmarkerResult): number {
  const lm = results.faceLandmarks?.[0]
  if (!lm) return 0

  const d3 = (a: number, b: number) =>
    Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y, (lm[a].z ?? 0) - (lm[b].z ?? 0))

  const lipGap = d3(13, 14)
  const eyeDist = d3(33, 263)

  return eyeDist > 0 ? lipGap / eyeDist : 0
}

export function isLipsOccluded(
  lm: FaceLandmarkerResult['faceLandmarks'][0],
  handResults: HandLandmarkerResult
): boolean {
  if (!handResults.landmarks || handResults.landmarks.length === 0) return false

  // Both mouth corners must be covered — ensures the hand spans the full mouth width.
  const eyeDist = Math.hypot(lm[33].x - lm[263].x, lm[33].y - lm[263].y)
  const r = eyeDist * 0.35

  for (const handLms of handResults.landmarks) {
    let leftCovered = false
    let rightCovered = false
    for (const p of handLms) {
      if (Math.hypot(p.x - lm[61].x, p.y - lm[61].y) < r) leftCovered = true
      if (Math.hypot(p.x - lm[291].x, p.y - lm[291].y) < r) rightCovered = true
    }
    if (leftCovered && rightCovered) return true
  }
  return false
}

export function drawFaceMesh(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  videoEl: HTMLVideoElement,
  results: FaceLandmarkerResult
): void {
  const cw = canvas.width
  const ch = canvas.height
  ctx.clearRect(0, 0, cw, ch)

  const landmarks = results.faceLandmarks[0]

  const vw = videoEl.videoWidth  || cw
  const vh = videoEl.videoHeight || ch
  const scale = Math.max(cw / vw, ch / vh)
  const ox = (cw - vw * scale) / 2
  const oy = (ch - vh * scale) / 2

  const px = (i: number) => landmarks[i].x * vw * scale + ox
  const py = (i: number) => landmarks[i].y * vh * scale + oy

  for (const conns of MESH_FEATURES) {
    ctx.strokeStyle = 'rgba(251,191,36,0.28)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (const c of conns) {
      ctx.moveTo(px(c.start), py(c.start))
      ctx.lineTo(px(c.end),   py(c.end))
    }
    ctx.stroke()

    ctx.fillStyle = 'rgba(251,191,36,0.60)'
    const seen = new Set<number>()
    for (const c of conns) {
      for (const idx of [c.start, c.end]) {
        if (!seen.has(idx)) {
          seen.add(idx)
          ctx.beginPath()
          ctx.arc(px(idx), py(idx), 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }
}

export function clearFaceMesh(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

export function drawDonut(canvas: HTMLCanvasElement, nosePct: number, mouthPct: number): void {
  const ctx  = canvas.getContext('2d')!
  const size = canvas.width
  const cx   = size / 2
  const cy   = size / 2
  const r    = size * 0.38
  const lw   = size * 0.14
  const TAU  = Math.PI * 2
  const start = -Math.PI / 2
  const noseFrac = nosePct / 100

  const cs = getComputedStyle(document.body)
  const surface2 = cs.getPropertyValue('--surface2').trim() || '#1e1e1e'
  const textColor = cs.getPropertyValue('--text').trim() || '#e5e5e5'
  const textDim   = cs.getPropertyValue('--text-dim').trim() || '#6b7280'

  ctx.clearRect(0, 0, size, size)

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.strokeStyle = surface2
  ctx.lineWidth = lw
  ctx.stroke()

  if (mouthPct > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, start + noseFrac * TAU, start + TAU)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = lw
    ctx.lineCap = 'butt'
    ctx.stroke()
  }

  if (nosePct > 0) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, start, start + noseFrac * TAU)
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = lw
    ctx.lineCap = 'butt'
    ctx.stroke()
  }

  ctx.fillStyle = textColor
  ctx.font = `bold ${Math.round(size * 0.17)}px system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${nosePct}%`, cx, cy - size * 0.05)
  ctx.font = `${Math.round(size * 0.09)}px system-ui`
  ctx.fillStyle = textDim
  ctx.fillText('nose', cx, cy + size * 0.1)
}
