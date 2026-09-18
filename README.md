# TeleFetch Studio

A premium, dark-themed **Telegram channel bulk downloader** with history scanning, smart keyword/extension filters, a persistent download queue with real progress, real-time channel monitoring, keyword-based folder organization, history/CSV reporting, and desktop notifications.

It connects to Telegram with **your own account** through the official MTProto API (GramJS – the JavaScript port of Telethon). It only sees channels your account can already access and never bypasses permissions, paywalls or restrictions.

> **Delivery note.** The original brief asked for a Python/PySide6 desktop app packaged with PyInstaller. The build environment this project was produced in is a Linux Next.js + PostgreSQL platform with no Windows, Qt or PyInstaller support, so the application was implemented as a **locally-run desktop-style web app** (Next.js 16, TypeScript, Drizzle ORM, GramJS) with the same architecture, features and safety rules. It runs on Windows, macOS and Linux with Node.js; see [Packaging](#packaging-and-limitations) for how to get a single-window "app" experience and what a native `.exe` would require.

---

## Features

| Area | What you get |
|------|--------------|
| **Telegram login** | Phone + code, two-factor password, **QR login**; session stored in a `0600` file in the per-user app-data dir; logout revokes + deletes it |
| **Channels** | Search your own dialog list, resolve public `@username` / `t.me` links, multi-select, per-channel *Scan* and *Monitor* toggles |
| **History scan** | Full history or date range, live counters (messages examined, attachments, matches, remaining estimate), safe cancel, FLOOD_WAIT-aware pagination |
| **Filters** | Include/exclude keywords, ANY/ALL rule, filename/caption toggles, extension chips + custom extensions, min/max size, date range, saved filter profiles, live results preview showing matched keyword + destination |
| **Downloads** | Persistent queue, concurrency 1–4 (default 2), per-file pause / resume / retry / cancel / remove, bulk actions, real bytes / speed / ETA, `.telefetch-part` temp files + atomic rename, size verification, exponential backoff, FLOOD_WAIT honouring, crash recovery on restart |
| **Destination** | Defaults to the OS Downloads folder (never a hardcoded username), first-run confirmation, Browse / Open folder / Restore default, `base/<keyword>/[channel]/[YYYY-MM]/file`, Windows-safe sanitization, traversal protection, reserved-name handling, free-space + writability checks, skip / rename / replace policy |
| **Monitoring** | Watches monitored channels via `NewMessage` updates while the app runs, applies the active filter, auto-enqueues, start / pause / resume / stop, duplicate-event guard, auto-restore after restart |
| **Reporting** | Activity feed, completed list with channel / keyword / extension / date filters, history table, CSV export, "Show file" / "Open folder" |
| **Notifications** | In-app toasts + browser desktop notifications for completions, new matches, failures |
| **Privacy** | No telemetry; codes, passwords, API hash and session strings are never logged or stored in the DB |

---

## Quick start

### 1. Requirements
* Node.js 20+ (22 recommended)
* PostgreSQL 14+ (local instance is fine)

### 2. Telegram API credentials
1. Sign in at <https://my.telegram.org> → **API development tools**.
2. Create an app; copy **api_id** and **api_hash**.
3. `cp .env.example .env` and fill in `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `DATABASE_URL`.

These credentials identify *your application build*. Telegram's terms discourage sharing them publicly, which is why they are read from the environment rather than baked into the app. Anyone you give the app to needs their own pair.

### 3. Run
```bash
npm install
npx drizzle-kit push      # create tables (versioned via drizzle schema)
npm run build && npm run start
# Windows: scripts\start_windows.bat     macOS/Linux: ./scripts/start.sh
```
Open <http://localhost:3000>.

### 4. Sign in
Settings → **Telegram account** → enter phone → code → (2FA password) — or click **Show QR code** and scan from Telegram → Settings → Devices → *Link Desktop Device*.

### 5. Use it
1. **Channels** – search your chats or paste a public link; toggle *Scan* / *Monitor*.
2. **Search & Filters** – enter keywords (e.g. `python, data science`), pick extensions, sizes and dates. The **Folder preview** shows e.g. `C:\Users\<you>\Downloads\python\`.
3. Press **Scan**. Review the matching-files preview, select files (or all) and press **Download**.
4. Watch **Download Queue** for live progress; **Completed** and **History & Reports** for results.
5. **Live Monitor** → *Start monitoring* to auto-download new matching posts while the app is open.

---

## Architecture

```
src/
  app/                    UI layer (Next.js App Router, client components)
    page.tsx              Dashboard
    channels/  search/  queue/  completed/  monitor/  history/  settings/
    api/                  Application controller (HTTP handlers)
      state  auth  channels  scan  queue  settings  history  profiles  fs  health
  components/
    shell.tsx             Sidebar, top bar, notifications, toasts, keyboard shortcuts
    ui.tsx                Design system: Card, Badge, Toggle, Progress, Modal, FolderPicker, FileIcon…
    destination.tsx       Destination selector + first-run confirmation dialog
    task-row.tsx          Queue/complete row with per-file controls
    store.tsx             Client state (1.5 s polling of /api/state) + toast/notification bridge
  lib/
    filters.ts            Filter engine (pure)
    paths.ts              Destination & file-organization service (pure + fs checks)
    settings.ts           Settings repository + activity/diagnostic log
    telegram/client.ts    Telegram client + auth/session manager + channel discovery
    telegram/scanner.ts   History scanner, media extraction, enqueue/dedup
    telegram/downloader.ts Queue scheduler, download worker, state machine, retries
    telegram/monitor.ts   Real-time monitoring service
    qr.ts                 Offline QR rendering
  db/schema.ts            PostgreSQL schema (settings, accounts, channels, filter_profiles,
                          download_tasks, download_history, dedup_records, activity_events)
tests/                    Vitest suites (mocked Telegram objects, no credentials needed)
docs/MANUAL_INTEGRATION_TESTING.md
```

**Concurrency model.** All Telegram and disk work runs in the Node server process; the UI never blocks. Long jobs (scan, downloads, monitoring) live in process-global singletons and publish progress that the UI polls. Cancellation is cooperative (flags checked inside progress callbacks). On startup, tasks left in `downloading` by a crash are re-queued.

**Queue state machine.** `queued → downloading → completed | failed | cancelled | paused | skipped`; `paused/failed/cancelled/skipped → queued` on resume/retry. Enforced by `canTransition()` and covered by tests.

---

## Tests

```bash
npx vitest run
```
33 tests cover keyword include/exclude + ANY/ALL logic, filename/caption toggles, extension/mime fallback, size and date bounds, Windows filename sanitization (invalid chars, reserved names, traversal, empties), keyword-folder resolution, collision policies, writable / inaccessible / missing destinations, disk-space guard, queue transitions, and media extraction from mocked Telegram messages. Real-account scenarios are in `docs/MANUAL_INTEGRATION_TESTING.md`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Sidebar says **API not configured** | Set `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` in `.env` and restart |
| `PHONE_CODE_INVALID` / expired | Request a new code; codes are single-use |
| `FLOOD_WAIT_x` | Telegram rate limit — the app waits automatically for downloads; for login, wait the shown seconds |
| Downloads stuck in *queued* | Check sidebar connection; queue is paused? (Queue → Resume); destination unavailable? (Settings) |
| "Destination unavailable / insufficient disk space" | Choose another folder with **Browse…**; the app never writes partial files as completed |
| Channel not found | Your account must already be a member of private channels; public ones need the exact username |
| Monitoring stops | Monitoring only runs while the server is running; it auto-restores on the next start if it was enabled |

Diagnostics: Settings → **Logs & diagnostics** (no secrets are ever written there).

---

## Packaging and limitations

* **Windows executable.** This environment cannot produce or test a Windows binary. To ship a single-window desktop build, wrap the production server with [Tauri](https://tauri.app) or Electron (`electron-builder --win`) pointing at `http://localhost:3000`, or use `pkg`/`nexe`-style bundling of `next start`. PostgreSQL must be available on the target machine (or swap `src/db` for an embedded driver such as PGlite — the Drizzle schema is unchanged).
* **Resume.** GramJS does not offer byte-range resume of a media transfer, so *resume* restarts the file from zero (partial `.telefetch-part` files are discarded). The UI never claims otherwise.
* **Background mode.** There is intentionally no hidden/stealth mode; monitoring runs only while the app is open.
* **Rate limits.** Defaults (2 parallel, 60 s auto-sleep threshold, exponential backoff) are conservative. Raising concurrency to 4 increases FLOOD_WAIT risk.
* **Light theme** is provided as a preview setting; dark is the primary design.

## Privacy notice
TeleFetch Studio communicates only with Telegram's servers using your account. Session data, settings, queue and history stay on your machine. Downloaded content is stored only in the destination folder you choose. Logging out revokes the Telegram session and deletes the local session file.
# telefetch-studio-application
