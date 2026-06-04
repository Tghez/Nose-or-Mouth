import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { Session } from '../../types/session'

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
  fs.writeFileSync(getSessionsPath(), JSON.stringify(all, null, 2), 'utf8')
}
