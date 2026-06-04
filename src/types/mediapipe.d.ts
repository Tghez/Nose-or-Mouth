// Type declarations for @mediapipe/face_mesh loaded via CDN script tag.
// The FaceMesh class is exposed as a global by the CDN bundle.

interface NormalizedLandmark {
  x: number
  y: number
  z: number
  visibility?: number
}

type NormalizedLandmarkList = NormalizedLandmark[]

interface FaceMeshResults {
  multiFaceLandmarks?: NormalizedLandmarkList[]
}

interface FaceMeshConfig {
  locateFile: (file: string) => string
}

interface FaceMeshOptions {
  maxNumFaces?: number
  refineLandmarks?: boolean
  minDetectionConfidence?: number
  minTrackingConfidence?: number
}

declare class FaceMesh {
  constructor(config: FaceMeshConfig)
  setOptions(options: FaceMeshOptions): void
  onResults(listener: (results: FaceMeshResults) => void): void
  send(inputs: { image: HTMLVideoElement }): Promise<void>
  initialize(): Promise<void>
  close(): void
}
