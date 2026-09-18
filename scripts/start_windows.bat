@echo off
REM TeleFetch Studio — local launcher for Windows.
REM Requires Node.js 20+
cd /d "%~dp0\.."
if not exist ".env" (
  echo .env not found. Copy .env.example to .env and fill in TELEGRAM_API_ID / TELEGRAM_API_HASH.
  pause & exit /b 1
)
if not exist "node_modules" call npm install --legacy-peer-deps
call npm run build
start "" http://localhost:3000
call npm run start
