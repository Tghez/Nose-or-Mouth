import { useState, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useAppContext } from '../store/AppContext'
import { avg, sleep } from '../lib/utils'

export interface CalibrationRefs {
  activeRef: MutableRefObject<boolean>
  collectingRef: MutableRefObject<boolean>
  samplesRef: MutableRefObject<number[]>
  onRatioUpdate: (ratio: number) => void
  // Set by CalibrationModal while it's mounted, so the detection loop can
  // mirror the face-mesh overlay onto the calibration preview too.
  canvasRef: MutableRefObject<HTMLCanvasElement | null>
}

export interface CalibrationHookState {
  step: number                     // 0=idle, 1=closed, 2=natural, 3=wide, 4=done
  phase: 'idle' | 'countdown' | 'collecting' | 'done'
  countdown: number | null         // 3, 2, 1 during countdown; null otherwise
  instruction: string              // large text shown to user
  explanation: string              // small dim text below instruction
  ratioDisplay: string             // live ratio or '—'
  completedSteps: number           // 0–3, drives ring segment fill
  btnDisabled: boolean
  btnLabel: string
  done: boolean
}

export function useCalibration() {
  const { dispatch } = useAppContext()

  const [calState, setCalState] = useState<CalibrationHookState>({
    step: 0,
    phase: 'idle',
    countdown: null,
    instruction: 'Ready to calibrate',
    explanation: 'This takes about 12 seconds',
    ratioDisplay: '—',
    completedSteps: 0,
    btnDisabled: false,
    btnLabel: 'Start Calibration',
    done: false,
  })

  const activeRef: MutableRefObject<boolean> = useRef(false)
  const collectingRef: MutableRefObject<boolean> = useRef(false)
  const samplesRef: MutableRefObject<number[]> = useRef([])
  const canvasRef: MutableRefObject<HTMLCanvasElement | null> = useRef(null)

  function onRatioUpdate(ratio: number): void {
    if (activeRef.current) {
      setCalState(s => ({ ...s, ratioDisplay: ratio.toFixed(4) }))
    }
  }

  // Stable container — individual ref .current values change, object identity stays the same
  const calibrationRefs = useRef<CalibrationRefs>({ activeRef, collectingRef, samplesRef, onRatioUpdate, canvasRef }).current

  async function runCountdown(step: number, instruction: string, explanation: string): Promise<void> {
    for (const n of [3, 2, 1]) {
      setCalState(s => ({ ...s, step, phase: 'countdown', countdown: n, instruction, explanation, btnDisabled: true }))
      await sleep(1000)
    }
    setCalState(s => ({ ...s, phase: 'collecting', countdown: null }))
  }

  async function startCalibration(): Promise<void> {
    activeRef.current = true

    // Step 1: Closed
    await runCountdown(1, 'Close your mouth', 'Breathe through your nose naturally')
    samplesRef.current = []
    collectingRef.current = true
    await sleep(3000)
    collectingRef.current = false
    const closedAvg = avg(samplesRef.current)
    setCalState(s => ({ ...s, completedSteps: 1 }))

    // Step 2: Natural mouth open
    await runCountdown(2, 'Breathe through your mouth', 'as you normally would')
    samplesRef.current = []
    collectingRef.current = true
    await sleep(3000)
    collectingRef.current = false
    const naturalOpenAvg = avg(samplesRef.current)
    setCalState(s => ({ ...s, completedSteps: 2 }))

    // Step 3: Wide open (ceiling reference — not used in formula)
    await runCountdown(3, 'Open your mouth wide', 'as wide as you can')
    samplesRef.current = []
    collectingRef.current = true
    await sleep(3000)
    collectingRef.current = false
    setCalState(s => ({ ...s, completedSteps: 3 }))

    // Midpoint between closed baseline and actual mouth-breathing level
    const raw = closedAvg + (naturalOpenAvg - closedAvg) * 0.5
    const clamped = parseFloat(Math.min(Math.max(raw, 0.01), 0.95).toFixed(4))

    dispatch({ type: 'SET_THRESHOLD', payload: clamped })
    await window.electronAPI.saveSettings({ threshold: clamped, calibrated: true })
    dispatch({ type: 'SET_SETTINGS', payload: { threshold: clamped, calibrated: true } })

    activeRef.current = false

    setCalState({
      step: 4,
      phase: 'done',
      countdown: null,
      instruction: 'All done!',
      explanation: `Threshold set to ${clamped.toFixed(4)}`,
      ratioDisplay: clamped.toFixed(4),
      completedSteps: 3,
      btnDisabled: false,
      btnLabel: 'Close',
      done: true,
    })
  }

  function skipCalibration(): void {
    activeRef.current = false
    collectingRef.current = false
    window.electronAPI.saveSettings({ calibrated: true })
    dispatch({ type: 'SET_SETTINGS', payload: { calibrated: true } })
    dispatch({ type: 'HIDE_MODAL', payload: 'calibration' })
  }

  function resetCalibration(): void {
    activeRef.current = false
    collectingRef.current = false
    samplesRef.current = []
    setCalState({
      step: 0,
      phase: 'idle',
      countdown: null,
      instruction: 'Ready to calibrate',
      explanation: 'This takes about 12 seconds',
      ratioDisplay: '—',
      completedSteps: 0,
      btnDisabled: false,
      btnLabel: 'Start Calibration',
      done: false,
    })
  }

  return { calState, calibrationRefs, startCalibration, skipCalibration, resetCalibration }
}
