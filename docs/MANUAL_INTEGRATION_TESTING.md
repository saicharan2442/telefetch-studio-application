# Manual integration testing guide (authorized Telegram account)

The automated suite (`npx vitest run`) uses mocked Telegram objects and needs no credentials.
This guide covers the real-account checks that cannot be automated safely.

Prerequisites: `.env` with `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `DATABASE_URL`; app started via `scripts/start.sh` or `start_windows.bat`.

| # | Step | Expected |
|---|------|----------|
| 1 | Settings → enter phone → Send code | Stage becomes "awaiting code"; activity log shows a masked phone, never the code |
| 2 | Enter code (and 2FA password if enabled) | Sidebar shows **Connected** with your name; `session.secret` (0600) created in app data dir |
| 3 | Restart the server | Still connected without re-login (session restored) |
| 4 | Settings → Show QR code (after logout) | QR renders; scanning from Telegram → Devices signs you in |
| 5 | Channels → Search | Only channels/groups from your own dialog list appear |
| 6 | Channels → Resolve `@durov` style public username | Channel is resolved and can be added; a private channel you are not in yields a clear error |
| 7 | Search → keywords `python`, extensions `.pdf` → Scan | Progress counters move; Cancel stops within a few seconds |
| 8 | Results list | Each row shows matched keyword, channel, size, and full destination path (`<base>/python/`) |
| 9 | Download all | Queue shows real bytes/speed/ETA; `*.telefetch-part` exists while transferring; final file appears only after completion |
| 10 | Pause during download → Resume | Task goes to paused, partial file removed, re-download starts from the beginning on resume (GramJS does not support byte-range resume) |
| 11 | Re-run same scan → Download all | Files already downloaded are marked and skipped (dedup) |
| 12 | Put an existing file with the same name in the folder | Policy rename → `name (1).ext`; skip → task "skipped"; replace → replaced after completion |
| 13 | Point destination to a read-only folder | Clear error, download fails without partial garbage, choose another folder works |
| 14 | Monitor → enable channel → Start; post a matching file in a test channel you own | Event appears in the live stream within seconds; file auto-queued once (no duplicates on reconnect) |
| 15 | History → Export CSV | CSV downloads with timestamp, channel, filename, size, keyword, destination, status |
| 16 | Settings → Log out | Session revoked on Telegram, local session file deleted, history retained |
