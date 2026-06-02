# Mouth Breather

A real-time desktop app that uses your webcam to track whether you're breathing through your nose or mouth — and gently keeps you accountable throughout the day.

Built as a personal project for my brother-in-law, who is working on improving his breathing habits and switching to consistent nose breathing.

---

## What it does

- Watches your face via webcam using [MediaPipe FaceMesh](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
- Detects in real time whether your mouth is open (mouth breathing) or closed (nose breathing)
- Tracks daily totals: how long you spent breathing through your nose vs your mouth
- Shows a daily summary with a breakdown chart and a streak counter for good days
- Sends a notification at a time you choose to review the day's stats
- All processing is fully local — no video, no data, nothing leaves your device

---

## Features

- **Live detection** — nose 👃 / mouth 👄 state updates every 200ms
- **Daily timers** — cumulative nose vs mouth seconds with a ratio bar
- **Daily summary** — donut chart, streak counter, motivational message
- **Calibration** — measures your personal mouth positions for accurate thresholds
- **Sensitivity control** — fine-tune detection via a slider in settings
- **Scheduled reminder** — pick a time to automatically show the daily summary
- **Always on top** — keep the window above other apps while you work
- **Tray app** — minimize to system tray, runs quietly in the background
- **Start at login** — launch automatically on startup

---

## Installation

### Windows
1. Go to [Actions](../../actions) → latest green Build run → download **Mouth-Breather-Windows**
2. Run the `.exe` installer

### macOS
1. Go to [Actions](../../actions) → latest green Build run → download **Mouth-Breather-Mac**
2. Open the `.dmg` and drag the app to Applications
3. **First launch:** macOS will warn the app is from an unidentified developer (no paid Apple certificate). Right-click the app → **Open** → **Open**

---

## How to use

1. **Allow camera access** on first launch
2. Complete the **calibration** — keep your mouth closed for 3 seconds, then open wide for 3 seconds. The app sets your personal detection threshold from these measurements.
3. The app runs in the background. Check the window anytime to see your nose vs mouth split.
4. Set a **daily summary time** in Settings to get an automatic end-of-day recap.

---

## Privacy

- No network requests are made after the MediaPipe model loads on first run
- No video is recorded or stored — only breathing state (nose/mouth) and second-level counters
- All session data is saved locally in your app data folder

---

## Tech stack

- [Electron](https://www.electronjs.org/) — desktop shell
- [MediaPipe FaceMesh](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) — face landmark detection (loaded from CDN)
- [electron-store](https://github.com/sindresorhus/electron-store) — settings persistence
- Vanilla JS, no framework, no bundler

---

## Building from source

```bash
git clone https://github.com/Tghez/Nose-or-Mouth.git
cd Nose-or-Mouth
npm install
npm start          # run in development
npm run build:win  # build Windows installer
npm run build:mac  # build macOS DMG
```
