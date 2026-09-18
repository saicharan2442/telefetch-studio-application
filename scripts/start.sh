#!/usr/bin/env bash
# TeleFetch Studio — local launcher for macOS/Linux.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo ".env missing — copy .env.example and fill in values"; exit 1; }
[ -d node_modules ] || npm install
npx drizzle-kit push
npm run build
npm run start
