'use strict'

const fs = require('fs')
const path = require('path')
const { app } = require('electron')

function getSessionsPath() {
  const dir = path.join(app.getPath('userData'), 'mouth-breather')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return path.join(dir, 'sessions.json')
}

function readAll() {
  const p = getSessionsPath()
  if (!fs.existsSync(p)) return []
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (_e) {
    return []
  }
}

function getSession(date) {
  return readAll().find(s => s.date === date) || null
}

function saveSession(session) {
  const all = readAll()
  const idx = all.findIndex(s => s.date === session.date)
  if (idx >= 0) {
    all[idx] = session
  } else {
    all.push(session)
  }
  fs.writeFileSync(getSessionsPath(), JSON.stringify(all, null, 2), 'utf8')
}

module.exports = { getSession, saveSession, readAll }
