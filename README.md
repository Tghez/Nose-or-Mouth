# Mouth Breather

**Real-time nose vs. mouth breathing tracker for your desktop — all processing stays on your device.**

Mouth Breather uses your webcam and MediaPipe face landmark detection to monitor your breathing pattern throughout the day, giving you a concrete daily split between nose and mouth breathing so you can build better habits over time.

---

Built as a personal project for my brother-in-law, who is working on improving his breathing habits and switching to consistent nose breathing.


## Why Nose-or-Mouth?

Most people mouth-breathe without realizing it. It's a habitual, largely unconscious behavior — but the downstream effects are real.

**Nasal breathing:**
- Filters, warms, and humidifies inhaled air before it reaches the lungs
- Produces nitric oxide in the nasal cavity, which dilates blood vessels and improves oxygen uptake efficiency
- Activates the diaphragm more fully, promoting slower, deeper breaths and engaging the parasympathetic (rest-and-digest) nervous system

**Chronic mouth breathing is associated with:**
- Reduced sleep quality and increased risk of sleep-disordered breathing
- Dental malocclusion and dry mouth from saliva loss
- Forward head posture as the jaw and airway compensate
- Higher baseline arousal and shallow chest breathing patterns

The challenge is that you can't notice what you can't observe. Mouth Breather turns an invisible habit into a visible metric — a daily ratio you can actually act on.

---

## How It Works

### Detection pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  Webcam (live stream)                                           │
│  Captured at ~30 fps, never recorded or transmitted             │
└──────────────────────┬──────────────────────────────────────────┘
                       │ raw frames (renderer process, in-memory only)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  MediaPipe FaceLandmarker                                       │
│  Runs entirely in-browser (WASM), no network calls              │
│  Returns 478 3D facial landmarks per frame                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │ landmark coordinates (x, y, z)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Mouth Aperture Calculation                                     │
│  Measures the vertical distance between inner lip landmarks     │
│  Normalised against inter-eye distance (removes head distance)  │
└──────────────────────┬──────────────────────────────────────────┘
                       │ normalised aperture ratio (0.0 – 1.0)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Threshold Comparison                                           │
│  Compared against your personal calibrated baseline             │
│  (set during first-run calibration, adjustable via slider)      │
└───────────┬─────────────────────────────┬───────────────────────┘
            │ below threshold             │ above threshold
            ▼                             ▼
    👃 Nose Breathing              👄 Mouth Breathing
            │                             │
            └──────────────┬──────────────┘
                           │ state sampled every 200 ms
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Session Counter                                                │
│  Accumulates nose_seconds / mouth_seconds for the current day   │
│  Persisted locally in your OS userData folder (JSON)            │
└─────────────────────────────────────────────────────────────────┘
```

### Calibration

On first run, the app measures your personal mouth geometry in two poses — fully closed and wide open. This establishes a mid-point threshold tuned to your face, making detection robust across different users and camera positions.

### Sensitivity

A slider in Settings shifts the threshold up or down from the calibrated baseline, letting you decide how far open "counts" as mouth breathing for your use case.

---

## Features

- **Live detection** — nose / mouth state updates every 200 ms
- **Daily timers** — cumulative nose vs. mouth seconds with a visual ratio bar
- **Daily summary** — breakdown chart, streak counter, and motivational message
- **Calibration** — personal mouth-position baseline for accurate detection
- **Sensitivity control** — fine-tune the detection threshold via a slider
- **Scheduled reminder** — pick a time to automatically show the daily summary
- **Always on top** — keep the window above other apps while you work
- **Tray app** — minimises to system tray, runs quietly in the background
- **Start at login** — launch automatically on startup

---

## Installation

### Windows
1. Go to **[Releases](../../releases/latest)** and download the `.exe` installer
2. Run the installer. If Windows SmartScreen appears, click **More info → Run anyway** (the app is unsigned)

### macOS
1. Go to **[Releases](../../releases/latest)** and download the `.dmg`
2. Open the `.dmg` and drag **Mouth Breather** to Applications
3. Try to open it — macOS will block it. Open **System Settings → Privacy & Security**, scroll to the Security section, and click **Open Anyway**

> **On a managed Mac where "Open Anyway" is greyed out?** Remove the quarantine flag before opening the DMG:
> ```bash
> xattr -d com.apple.quarantine ~/Downloads/Mouth\ Breather-*.dmg
> ```

---

## How to Use

1. **Allow camera access** on first launch
2. Complete the **calibration** — mouth closed for 3 seconds, then open wide for 3 seconds. The app sets your personal detection threshold from these two poses.
3. Leave the app running in the background. Check the window or tray at any time to see your nose vs. mouth split.
4. Set a **daily summary time** in Settings for an automatic end-of-day recap.

---

## Privacy

- All face detection runs locally via WebAssembly — no frames are sent anywhere
- No video is recorded or stored — only the derived breathing state (nose/mouth) and per-second counters
- All session data is saved locally in your OS app-data folder

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Electron](https://www.electronjs.org/) 33 |
| Build tooling | [electron-vite](https://electron-vite.org/) (Vite / rolldown) |
| Language | [TypeScript](https://www.typescriptlang.org/) (strict mode) |
| Face detection | [MediaPipe FaceLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) (WASM, local) |
| Storage | [electron-store](https://github.com/sindresorhus/electron-store) (JSON in userData) |

---

## Building from Source

```bash
git clone https://github.com/Tghez/Nose-or-Mouth.git
cd Nose-or-Mouth
npm install
npm run dev        # development mode with hot reload
npm run dist:win   # build Windows installer
npm run dist:mac   # build macOS DMG
```
