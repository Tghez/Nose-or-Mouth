import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { Session } from '../../types/session'

const RETENTION_DAYS = 7

function cutoffDateString(): string {
  const d = new Date(Date.now() - (RETENTION_DAYS - 1) * 86400_000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getSessionsPath(): string {
  const dir = path.join(app.getPath('userData'), 'mouth-breather')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return path.join(dir, 'sessions.json')
}

export function readAll(): Session[] {
  const p = getSessionsPath()
  if (!fs.existsSync(p)) return []
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Session[]
  } catch {
    return []
  }
}

export function getSession(date: string): Session | null {
  return readAll().find(s => s.date === date) ?? null
}

export function saveSession(session: Session): void {
  const all = readAll()
  const idx = all.findIndex(s => s.date === session.date)
  if (idx >= 0) {
    all[idx] = session
  } else {
    all.push(session)
  }
  const cutoff = cutoffDateString()
  const pruned = all.filter(s => s.date >= cutoff)
  fs.writeFileSync(getSessionsPath(), JSON.stringify(pruned, null, 2), 'utf8')
}
