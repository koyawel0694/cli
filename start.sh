#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Starting Hermes backend (port 4000)..."
(cd "$DIR/backend" && npm run dev) &
echo "Starting Hermes frontend (port 5173)... use --port 5174 if 5173 is busy"
(cd "$DIR/frontend" && npm run dev) &
wait
