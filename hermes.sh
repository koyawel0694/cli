#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
if ! curl -sf http://localhost:4000/api/health > /dev/null 2>&1; then
  echo "Starting Hermes backend..."
  (cd "$DIR/backend" && nohup node server.js > /tmp/hermes-backend.log 2>&1 &)
  for i in $(seq 1 30); do
    sleep 1
    curl -sf http://localhost:4000/api/health > /dev/null 2>&1 && break
  done
fi
node "$DIR/cli/hermes.js" "$@"
