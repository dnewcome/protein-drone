#!/usr/bin/env bash
cd "$(dirname "$0")"
PORT="${1:-8000}"
echo "serving on http://localhost:$PORT"
exec python3 -m http.server "$PORT"
