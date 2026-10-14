#!/usr/bin/env bash
# Starts Timbul locally: installs dependencies on first run, then opens the app in your browser.
# The Gemini key is read from .env (GEMINI_API_KEY) by the local server and never sent to the browser.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Timbul needs Node.js 18 or newer: https://nodejs.org" >&2
  exit 1
fi
if [ ! -f .env ] && [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "No .env found. Copy .env.example to .env and put your Gemini key in GEMINI_API_KEY." >&2
  exit 1
fi
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "Installing dependencies (first run only)…"
  npm install --no-fund --no-audit
fi

PORT="${PORT:-5173}"
echo ""
echo "  Timbul is starting on http://localhost:${PORT}"
echo "  Use Chrome for the voice features. Press Ctrl+C to stop."
echo ""
if [ -n "${NO_OPEN:-}" ]; then exec npx vite --port "$PORT"; else exec npx vite --port "$PORT" --open; fi
