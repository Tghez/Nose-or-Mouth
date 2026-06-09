# Mouth Breather

A real-time desktop app that uses your webcam to track whether you're breathing through your nose or mouth — and gently keeps you accountable throughout the day.

Built as a personal project for my brother-in-law, who is working on improving his breathing habits and switching to consistent nose breathing.

---

## What it does

- Watches your face via webcam using [MediaPipe FaceLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
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
- **Calibration** — measures your personal mouth positions for an accurate threshold
- **Sensitivity control** — fine-tune detection via a slider in settings
- **Scheduled reminder** — pick a time to automatically show the daily summary
- **Always on top** — keep the window above other apps while you work
- **Tray app** — minimize to system tray, runs quietly in the background
- **Start at login** — launch automatically on startup

---

## Installation

### Windows
1. Go to **[Releases](../../releases/latest)** → download the `.exe` file (e.g. `Mouth Breather Setup 1.1.0.exe`)
2. Run the installer. If Windows SmartScreen appears, click **More info → Run anyway** (the app is unsigned)

### macOS
1. Go to **[Releases](../../releases/latest)** → download the `.dmg` file
2. Open the `.dmg` and drag **Mouth Breather** to Applications
3. Right-click **Mouth Breather** in Applications → **Open** → **Open** *(one-time confirmation — the app clears the Gatekeeper flag automatically so every launch after that is normal)*

> **On a managed or work Mac where right-click is blocked by IT policy?** Before opening the DMG, run this in Terminal — then repeat steps 2–3:
> ```bash
> xattr -d com.apple.quarantine ~/Downloads/Mouth\ Breather-*.dmg
> ```

---

## How to use

1. **Allow camera access** on first launch
2. Complete the **calibration** — keep your mouth closed for 3 seconds, then open wide for 3 seconds. The app sets your personal detection threshold from these measurements.
3. The app runs in the background. Check the window anytime to see your nose vs mouth split.
4. Set a **daily summary time** in Settings to get an automatic end-of-day recap.

---

## Privacy

- No network requests are made — the face detection model is bundled with the app
- No video is recorded or stored — only breathing state (nose/mouth) and second-level counters
- All session data is saved locally in your app data folder

---

## Tech stack

- [Electron](https://www.electronjs.org/) — desktop shell
- [electron-vite](https://electron-vite.org/) — build tooling
- [TypeScript](https://www.typescriptlang.org/) — strict mode throughout
- [MediaPipe FaceLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) — face landmark detection, bundled locally
- [electron-store](https://github.com/sindresorhus/electron-store) — settings persistence

---

## Building from source

```bash
git clone https://github.com/Tghez/Nose-or-Mouth.git
cd Nose-or-Mouth
npm install
npm run dev        # run in development
npm run dist:win   # build Windows installer
npm run dist:mac   # build macOS DMG
```
