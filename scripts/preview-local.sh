#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar}"
export SIMULATOR_CONTROL_URL=http://127.0.0.1:4020
export AUTH_MODE=local-demo AUTO_MIGRATE=true PORT=4010
export WEB_ORIGIN=http://localhost:5174,http://127.0.0.1:5174
if [[ -z "${VITE_GOOGLE_MAPS_KEY:-}" && -f apps/web/.env.production ]]; then
  while IFS='=' read -r key value; do
    if [[ "$key" == VITE_GOOGLE_MAPS_KEY ]]; then export VITE_GOOGLE_MAPS_KEY="$value"; fi
  done < apps/web/.env.production
fi
npm run api &
roadstar_api_pid=$!
trap 'kill "$roadstar_api_pid" 2>/dev/null || true' EXIT INT TERM
VITE_AUTH_MODE=local-demo VITE_API_URL='' npm run dev --workspace @roadstar/web -- --port 5174 --strictPort
