import { useState, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useAppContext } from '../store/AppContext'
import { avg, sleep } from '../lib/utils'

export interface CalibrationRefs {
  activeRef: MutableRefObject<boolean>
  collectingRef: MutableRefObject<boolean>
  samplesRef: MutableRefObject<number[]>
  onRatioUpdate: (ratio: number) => void
}

export interface CalibrationHookState {
  step: number
  stepLabel: string
  ratioDisplay: string
  btnDisabled: boolean
  btnLabel: string
  done: boolean
}

export function useCalibration() {
  const { dispatch } = useAppContext()

  const [calState, setCalState] = useState<CalibrationHookState>({
    step: 0,
    stepLabel: 'Press Start to begin',
    ratioDisplay: '—',
    btnDisabled: false,
    btnLabel: 'Start Calibration',
    done: false,
  })

  const activeRef: MutableRefObject<boolean> = useRef(false)
  const collectingRef: MutableRefObject<boolean> = useRef(false)
  const samplesRef: MutableRefObject<number[]> = useRef([])

  function onRatioUpdate(ratio: number): void {
    if (activeRef.current) {
      setCalState(s => ({ ...s, ratioDisplay: ratio.toFixed(4) }))
    }
  }

  // Stable container — individual ref .current values change, object identity stays the same
  const calibrationRefs = useRef<CalibrationRefs>({ activeRef, collectingRef, samplesRef, onRatioUpdate }).current

  async function startCalibration(): Promise<void> {
    activeRef.current = true
    setCalState(s => ({
      ...s,
      step: 1,
      stepLabel: 'Keep your mouth CLOSED naturally (3 sec)…',
      btnDisabled: true,
      ratioDisplay: '—',
      done: false,
    }))

    samplesRef.current = []
    collectingRef.current = true

    await sleep(3000)
    collectingRef.current = false
    const closedAvg = avg(samplesRef.current)

    setCalState(s => ({ ...s, step: 2, stepLabel: 'Now open your mouth wide (3 sec)…' }))
    samplesRef.current = []
    collectingRef.current = true

    await sleep(3000)
    collectingRef.current = false
    const openAvg = avg(samplesRef.current)

    const threshold = parseFloat((closedAvg + (openAvg - closedAvg) * 0.25).toFixed(4))
    const clamped   = Math.min(Math.max(threshold, 0.01), 0.95)

    dispatch({ type: 'SET_THRESHOLD', payload: clamped })
    await window.electronAPI.saveSettings({ threshold: clamped, calibrated: true })
    dispatch({ type: 'SET_SETTINGS', payload: { threshold: clamped, calibrated: true } })

    activeRef.current = false

    setCalState({
      step: 3,
      stepLabel: `Done! Threshold set to ${clamped.toFixed(4)}`,
      ratioDisplay: clamped.toFixed(4),
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
      stepLabel: 'Press Start to begin',
      ratioDisplay: '—',
      btnDisabled: false,
      btnLabel: 'Start Calibration',
      done: false,
    })
  }

  return { calState, calibrationRefs, startCalibration, skipCalibration, resetCalibration }
}
