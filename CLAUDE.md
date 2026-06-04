# Mouth Breather — Project Context

## What this is

An Electron desktop app that uses MediaPipe FaceMesh to detect whether the user is breathing through their nose or mouth in real time. The webcam feed is processed 100% locally — no video ever leaves the device. Only aggregated counters (seconds of nose/mouth breathing per day) sync to the cloud.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop app | Electron 33 |
| Build tooling | electron-vite (Vite 8 / rolldown) |
| Language | TypeScript (strict mode) |
| Face detection | MediaPipe FaceMesh 0.4 (loaded from CDN) |
| Local storage | electron-store (JSON, in userData dir) |
| Auth + DB | Supabase (supabase-js SDK in renderer) |
| Subscriptions | Stripe (via Supabase Edge Functions) |
| Packaging | electron-builder |

---

## Architecture

```
Electron main process (Node.js)
  └── BrowserWindow (renderer)
        ├── MediaPipe FaceMesh — webcam detection loop (200ms)
        ├── Supabase JS SDK — auth + cloud sync
        └── IPC bridge (contextBridge) → main process
              ├── electron-store — local session/settings persistence
              └── Tray, Notifications, window management

Supabase (cloud backend — no separate server)
  ├── Auth (email/password)
  ├── Database: profiles + sessions tables (RLS enforced)
  └── Edge Functions (serverless)
        ├── stripe-checkout   → creates Stripe Checkout Session
        ├── stripe-portal     → creates billing portal session
        └── stripe-webhook    → receives Stripe events, updates profiles
```

**No traditional backend server.** Stripe secret key lives only in Supabase environment variables, never in the Electron app.

---

## Key Files

```
src/
  main/
    index.ts              — main process: window, tray, IPC handlers, scheduler
    utils/
      storage.ts          — electron-store read/write for sessions + settings
      scheduler.ts        — daily summary timing, streak calculation
  preload/
    index.ts              — contextBridge IPC surface (typed)
  renderer/
    index.html            — app shell, auth modal, limit overlay, overlays
    src/
      app.ts              — core detection loop, UI, auth wiring, free-tier gate
      styles.css          — all styles
      supabase.ts         — Supabase client singleton (null if env vars missing)
      auth.ts             — initAuth, signIn, signUp, signOut, syncSession
  types/
    ipc.d.ts              — typed IPC channel names + payloads
    session.d.ts          — Session, StoreSchema, SummaryData types
    state.d.ts            — AppState, CalibrationState types

supabase/
  migrations/
    001_profiles.sql      — profiles table + RLS + auto-create trigger
    002_sessions.sql      — sessions table + RLS
  functions/              — Edge Functions (Phase 2, not yet created)
    stripe-checkout/
    stripe-portal/
    stripe-webhook/

electron.vite.config.ts   — build config (CJS output, externals)
.env                      — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (gitignored)
.env.example              — committed template
```

---

## Build & Run

```bash
npm run dev       # dev mode (hot reload, DevTools auto-opens detached)
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

The app runs fully offline/locally if env vars are missing (`isSupabaseConfigured` guard).

---

## Supabase Setup

### Tables

**`public.profiles`** (1:1 with auth.users)
- `id` uuid PK → auth.users
- `stripe_customer_id` text
- `stripe_subscription_id` text
- `subscription_status` text — `'free'` | `'active'` | `'past_due'` | `'cancelled'`
- `plan` text — `'monthly'` | `'annual'`

**`public.sessions`**
- `id` uuid PK
- `user_id` uuid → auth.users
- `date` date (unique per user per day)
- `nose_seconds` integer
- `mouth_seconds` integer

Both tables have RLS enabled. Migrations in `supabase/migrations/`.

Required grants (run once in SQL editor):
```sql
GRANT SELECT, INSERT, UPDATE ON public.sessions TO authenticated;
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

`FREE_DAILY_LIMIT_SECONDS = 600` in `app.ts`. Checked on every counter tick and on boot after session restore. `authState.isPro` is derived from `profiles.subscription_status === 'active'`.

---

## Important Patterns

### TypeScript / Build
- Main + preload output CJS (`format: 'cjs'`). Standard `import { ... } from 'electron'` — rolldown externalizes it and generates correct CJS destructuring.
- `app as typeof app & { isQuitting: boolean }` — typed cast instead of module augmentation (augmentation caused TS2300 duplicate identifier error).
- `"types": ["vite/client"]` in `tsconfig.web.json` — required for CSS side-effect imports.

### Supabase
- Client is `null` when env vars are absent — always guard with `if (!supabase)`.
- Session persistence via `localStorage` (Supabase SDK default) — works in Electron renderer, persists in userData dir.
- Upsert pattern: `onConflict: 'user_id,date'` — one row per user per day.

### Counter behavior
- Screen counters reset to 0 on every app relaunch (by design — shows current session only).
- `state.baseNoseSeconds` / `state.baseMouthSeconds` hold the restored day total for the free-tier limit check and local storage persistence, but are not shown on screen.
- Cloud sync and local storage both write `base + current` (running day total).

---

## Completed Phases

### Phase 0 — TypeScript Migration ✅
Full migration from vanilla JS to TypeScript with electron-vite. All original functionality preserved.

### Phase 1 — Auth + Cloud Sync ✅
- Supabase email/password auth
- Cloud sync of sessions (upsert every 30s while detecting)
- Free-tier daily limit (10 min) with upgrade prompt
- `authState.isPro` gates unlimited detection

---

## Remaining Phases

### Phase 2 — Stripe Subscriptions (next)

1. **Stripe setup**: create Product with monthly + annual Prices in test mode
2. **Three Supabase Edge Functions**:
   - `stripe-checkout` — receives `{ priceId, userId }`, creates Stripe Checkout Session, returns URL. App opens it via `shell.openExternal()`.
   - `stripe-portal` — creates billing portal session for subscription management
   - `stripe-webhook` — validates Stripe signature, handles `customer.subscription.created/updated/deleted` events → updates `profiles.subscription_status`
3. **Wire upgrade button** — replace `'Pro subscriptions coming soon!'` placeholder in `app.ts` with real Stripe checkout call
4. **Manage Subscription** — add button in signed-in auth view → opens billing portal

Required env vars to add (Supabase Edge Function secrets, not in .env):
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

Add to `.env` for the Electron app:
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Phase 3 — Production Polish

1. **Code signing** — Apple Developer cert (macOS notarization) + Windows EV cert (avoids SmartScreen warnings)
2. **Auto-updater** — `electron-updater`, publish releases to GitHub Releases
3. **Error tracking** — `@sentry/electron` for crash reports from production builds
4. **Remove dev DevTools** — remove `mainWindow.webContents.openDevTools({ mode: 'detach' })` from `src/main/index.ts` before shipping (currently only runs in dev mode behind `ELECTRON_RENDERER_URL` check)
