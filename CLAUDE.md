# Mouth Breather — Project Context

## What this is

An Electron desktop app that uses MediaPipe FaceMesh to detect whether the user is breathing through their nose or mouth in real time. The webcam feed is processed 100% locally — no video ever leaves the device. Only aggregated counters (seconds of nose/mouth breathing per day) sync to the cloud.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop app | Electron 33 |
| Build tooling | electron-vite (Vite 8 / rolldown) |
| Language | TypeScript 6 (strict mode) |
| UI framework | React 18 + @vitejs/plugin-react |
| Face detection | MediaPipe tasks-vision 0.10 (WASM, loaded locally) |
| Local storage | electron-store (JSON, in userData dir) |
| Auth + DB | Supabase (supabase-js SDK in renderer) |
| Subscriptions | Stripe (via Supabase Edge Functions) |
| Packaging | electron-builder |

---

## Architecture

```
Electron main process (Node.js)
  └── BrowserWindow (renderer — React app)
        ├── MediaPipe FaceLandmarker — webcam detection loop (200ms, rAF)
        ├── MediaPipe HandLandmarker — lip occlusion detection
        ├── Supabase JS SDK — auth + cloud sync
        └── IPC bridge (contextBridge) → main process
              ├── electron-store — local session/settings persistence
              └── Tray, Notifications, window management

Supabase (cloud backend — no separate server)
  ├── Auth (email/password)
  ├── Database: profiles table (RLS enforced) — session history is local-only, not synced to Supabase
  └── Edge Functions (serverless)
        ├── stripe-checkout   → creates Stripe Checkout Session
        ├── stripe-portal     → creates billing portal session
        └── stripe-webhook    → receives Stripe events, updates profiles
```

**No traditional backend server.** Stripe secret key lives only in Supabase environment variables, never in the Electron app.

---

## Renderer Structure (React)

```
src/renderer/src/
├── main.tsx                  — React entry: createRoot → <AuthProvider><AppProvider><App />
├── App.tsx                   — root component: boot sequence + full layout
├── styles.css                — all styles (flat CSS, no modules)
│
├── lib/                      — pure logic, zero React imports
│   ├── mediapipe.ts          — FaceLandmarker + HandLandmarker singletons, drawing fns, drawDonut
│   ├── supabase.ts           — Supabase client singleton (null if env vars missing)
│   └── utils.ts              — todayString, formatTime, formatMS, avg, sleep, buildSummaryBody
│
├── store/
│   ├── AppContext.tsx         — AppProvider + useAppContext + appReducer (useReducer)
│   └── AuthContext.tsx        — AuthProvider + useAuthContext (auth state + actions)
│
├── hooks/
│   ├── useCamera.ts          — startCamera / stopCamera / toggleCamera (manages MediaStream)
│   ├── useDetection.ts       — single rAF loop (never restarts); dispatches state every 200ms
│   ├── useCounters.ts        — 1s setInterval; ticks nose/mouth, free-tier gate, persist debounce
│   ├── useAlerts.ts          — rolling-window alert logic via refs (tickAlertWindow, resetAlertWindow)
│   ├── useCalibration.ts     — 3-step calibration; exposes CalibrationRefs for detection hook
│   ├── useSettings.ts        — load settings on boot + IPC onSettingsChanged subscription
│   ├── useSession.ts         — restore today's base seconds + free-tier boot check
│   └── useIpc.ts             — onDailySummaryTrigger subscription + RESET_DAY dispatch
│
├── features/
│   ├── camera/CameraSection.tsx        — video, face-canvas, status dot, face badge, controls
│   ├── detection/StateSection.tsx      — state-indicator, pulse ring, emoji, label
│   ├── counters/StatsSection.tsx       — nose/mouth timers, ratio bar
│   ├── calibration/CalibrationModal.tsx
│   ├── summary/SummaryModal.tsx + DonutChart.tsx
│   ├── settings/SettingsPanel.tsx
│   ├── auth/AuthModal.tsx
│   ├── tutorial/TutorialOverlay.tsx
│   ├── onboarding/OnboardingOverlay.tsx
│   ├── alerts/AlertPopup.tsx
│   └── limit/LimitOverlay.tsx
│
└── components/               — shared, non-feature-specific UI
    ├── Toolbar.tsx            — 3-button toolbar with flash animation
    ├── Toggle.tsx             — reusable toggle (used in settings + camera controls)
    ├── Toast.tsx              — #toast with reflow trick for animation replay
    └── StatusBar.tsx          — reads statusText from AppContext
```

## Main + Preload (unchanged from Phase 1)

```
src/
  main/
    index.ts              — window, tray, IPC handlers, scheduler
    utils/
      storage.ts          — electron-store read/write for sessions + settings
      scheduler.ts        — daily summary timing, streak calculation
  preload/
    index.ts              — contextBridge IPC surface (typed as window.electronAPI)
  types/
    ipc.d.ts              — typed IPC channel names + payloads
    session.d.ts          — Session, StoreSchema, SummaryData types
    state.d.ts            — AppState, CalibrationState types
    mediapipe.d.ts        — passthrough to npm types

supabase/
  migrations/
    001_profiles.sql                     — profiles table + RLS + auto-create trigger
    002_sessions.sql                     — sessions table + RLS (superseded, see 005)
    003_sessions_7day_retention.sql      — sessions retention trigger (superseded, see 005)
    004_profile_insert_conflict_safety.sql — hardens new-user trigger against OAuth re-linking
    005_drop_sessions_table.sql          — drops sessions table; history is local-only now
    006_simplify_subscription_status.sql — subscription_status collapsed to free/pro
  functions/              — Edge Functions (Phase 3, not yet created)
    stripe-checkout/
    stripe-portal/
    stripe-webhook/

electron.vite.config.ts   — build config; React plugin in renderer only
.env                      — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (gitignored)
.env.example              — committed template
```

---

## Build & Run

```bash
npm run dev       # dev mode (hot reload)
npm run build     # production build → out/
npm run preview   # production build + launch
```

---

## Environment Variables

`.env` in project root (never committed):

```
VITE_SUPABASE_URL=https://....supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

`VITE_` prefix exposes vars to the renderer via `import.meta.env.VITE_*`.

The app runs fully offline/locally if env vars are missing (`isSupabaseConfigured` guard in `lib/supabase.ts`).

---

## Supabase Setup

### Tables

**`public.profiles`** (1:1 with auth.users) — the only table; this is the sole source of truth for plan state
- `id` uuid PK → auth.users
- `stripe_customer_id` text
- `stripe_subscription_id` text
- `subscription_status` text — `'free'` | `'pro'` (CHECK constraint enforced)
- `plan` text — `'monthly'` | `'annual'`

RLS enabled. Migrations in `supabase/migrations/`. Session history is **not** stored in Supabase — it's local-only (`src/main/utils/storage.ts`), pruned to the last 7 days.

Required grant (run once in SQL editor):
```sql
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
```

### Auth
Email/password. Email confirmation can be disabled in Supabase dashboard for development (Authentication → Providers → Email → uncheck "Confirm email").

---

## Feature Gating

| Feature | Free | Pro |
|---|---|---|
| Live detection | 10 min/day | Unlimited |
| Cloud sync | ❌ | ✅ |
| History / streaks | ❌ (local only) | ✅ |

`FREE_DAILY_LIMIT_SECONDS = 600` defined in `hooks/useCounters.ts` and `hooks/useSession.ts`. Checked on every counter tick (useCounters) and on boot after session restore (useSession). `isPro` comes from `AuthContext` → `profiles.subscription_status === 'pro'`.

---

## Important Patterns

### React / State
- **AppContext** holds all app state via `useReducer`. Components read from `useAppContext()` and dispatch actions — never hold local copies of detection state.
- **AuthContext** is separate — holds `user`, `isPro`, and auth action methods. Wrap pattern: `<AuthProvider><AppProvider><App /></AppProvider></AuthProvider>`.
- **Hot-path refs**: `useDetection` and `useCounters` use `useRef` wrappers synced to context state via `useEffect`. This lets the rAF loop and 1s interval read latest values without being recreated on every render.
- **Detection dispatches on every 200ms frame** — no throttle. At 5 FPS this is ~5 React re-renders/second, which is fine and keeps UI responsive.
- **CalibrationRefs** (`activeRef`, `collectingRef`, `samplesRef`, `onRatioUpdate`) is a stable object created once via `useRef(…).current` in `useCalibration`. The detection hook's rAF closure (started once) can safely read it.

### MediaPipe
- `lib/mediapipe.ts` holds module-level singletons (`faceLandmarker`, `handLandmarker`). `initMediaPipe()` is called once from the `App.tsx` boot effect.
- WASM loaded from `./mediapipe-wasm` (local, not CDN). Files live in `src/renderer/public/mediapipe-wasm/`.
- `optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] }` in `electron.vite.config.ts` — must stay, prevents Vite from bundling the WASM glue.
- The rAF loop in `useDetection` starts immediately on mount but no-ops until `cameraReady` and `mediapipeReady` refs are both true.
- Mouth aperture uses center lip pair (landmarks 13, 14) + 3D inter-eye distance (landmarks 33, 263) — yaw-stable, maximally sensitive to partial openings. See comment in `lib/mediapipe.ts` for rationale.
- 3-frame rolling buffer (`ratioBuffer`) smooths jitter before threshold comparison.

### TypeScript / Build
- Main + preload output CJS (`format: 'cjs'`). Renderer is ESM (React default).
- `@types/react` v19 — `useRef<T>(null)` returns `RefObject<T | null>`, not `RefObject<T>`. Hook signatures use `RefObject<HTMLVideoElement | null>` to match.
- `app as typeof app & { isQuitting: boolean }` — typed cast in main process to avoid TS2300.
- `"jsx": "react-jsx"` in `tsconfig.web.json` — required for JSX without explicit React imports.
- `"types": ["vite/client"]` in `tsconfig.web.json` — required for CSS side-effect imports.

### Supabase
- Client is `null` when env vars are absent — always guard with `if (!supabase)` or use `isSupabaseConfigured`.
- Session persistence via `localStorage` (Supabase SDK default) — works in Electron renderer.
- Upsert pattern: `onConflict: 'user_id,date'` — one row per user per day.
- `syncSession` is in `AuthContext` (needs `user` ref); called from `useCounters` via a stable ref.

### Counter / Session behavior
- Screen counters (`noseSeconds`, `mouthSeconds` in AppContext) reset to 0 on every app relaunch — shows current session only.
- `baseNoseSeconds` / `baseMouthSeconds` hold the restored day total for the free-tier limit check and persistence, not shown on screen.
- Cloud sync and local storage both write `base + current` (running day total).
- Persist debounce: every 30 counter ticks (~30s). Also called immediately before showing summary and on daily-summary IPC trigger.

### IPC patterns
- All IPC subscriptions follow the pattern: register in `useEffect([], [])`, clean up in the return fn via `window.electronAPI.removeAllListeners(channel)`.
- Callbacks that need latest closure values use a ref wrapper: `const cbRef = useRef(fn); useEffect(() => { cbRef.current = fn }, [fn])`.
- Main → Renderer push events: `onDailySummaryTrigger` (handled in `useIpc`), `onSettingsChanged` (handled in `useSettings`).

### CSS / Styling
- All styles in `src/renderer/src/styles.css` — flat CSS with custom properties, no modules, no Tailwind.
- Dark mode is the default. Light mode toggled via `document.body.classList.toggle('light', ...)` — an imperative DOM call in `SettingsPanel` and `useSettings`, not React state.
- Fixed window size: 420×510px (set in main process, no resize).
- All original HTML `id` attributes and CSS class names are preserved exactly — adding new UI must reuse or extend existing class names.

---

## Completed Phases

### Phase 0 — TypeScript Migration ✅
Full migration from vanilla JS to TypeScript with electron-vite.

### Phase 1 — Auth + Cloud Sync ✅
Supabase email/password auth, free-tier daily limit (10 min), `isPro` gates unlimited detection. Session cloud sync (Supabase `sessions` table) was later removed — session history is local-only now (`src/main/utils/storage.ts`), pruned to the last 7 days.

### Phase 2 — React Migration ✅
Full renderer rewrite from monolithic `app.ts` + `index.html` to React 18 with feature-based folder structure. Zero behavioral or visual changes.

---

## Remaining Phases

### Phase 3 — Stripe Subscriptions (next)

1. **Stripe setup**: create Product with monthly + annual Prices in test mode
2. **Three Supabase Edge Functions**:
   - `stripe-checkout` — receives `{ priceId, userId }`, creates Stripe Checkout Session, returns URL. App opens it via `shell.openExternal()`.
   - `stripe-portal` — creates billing portal session for subscription management
   - `stripe-webhook` — validates Stripe signature, handles `customer.subscription.created/updated/deleted` → sets `profiles.subscription_status` to `'pro'` (active/trialing) or `'free'` (anything else — past_due, cancelled, etc.)
3. **Wire upgrade button** — replace `'Pro subscriptions coming soon!'` placeholder in `features/limit/LimitOverlay.tsx` with real Stripe checkout call
4. **Manage Subscription** — add button in `features/auth/AuthModal.tsx` signed-in view → opens billing portal

Required env vars (Supabase Edge Function secrets, not in `.env`):
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

Add to `.env` for the Electron app:
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Phase 4 — Production Polish

1. **Code signing** — Apple Developer cert (macOS notarization) + Windows EV cert (avoids SmartScreen warnings)
2. **Auto-updater** — `electron-updater`, publish releases to GitHub Releases
3. **Error tracking** — `@sentry/electron` for crash reports from production builds
4. **Remove dev DevTools** — `mainWindow.webContents.openDevTools({ mode: 'detach' })` in `src/main/index.ts` already gated behind `ELECTRON_RENDERER_URL` check (dev only)
