import type { SummaryData } from '../../../types/session'

export function todayString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatTime(totalSeconds: number): string {
  const s = Math.floor(totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':')
}

export function formatMS(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export function buildSummaryBody({ noseSeconds, mouthSeconds }: Pick<SummaryData, 'noseSeconds' | 'mouthSeconds'>): string {
  const total = noseSeconds + mouthSeconds
  if (total === 0) return 'No data recorded today.'
  const nosePct = Math.round((noseSeconds / total) * 100)
  return nosePct >= 80
    ? `Great day! ${nosePct}% nose breathing 👃`
    : `${nosePct}% nose / ${100 - nosePct}% mouth — keep it up!`
}
