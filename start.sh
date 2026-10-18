#!/bin/sh
set -e

echo "=== Starting LedgerCore Health Unified Container ==="

# 1. Start Node.js API backend on internal port 4700 if backend exists
if [ -d "backend" ] && command -v node >/dev/null 2>&1; then
  echo "[startup] Starting LedgerCore Node API backend on internal port 4700..."
  BACKEND_PORT=4700 PORT=4700 node backend/src/server.js &
  BACKEND_PID=$!
  echo "[startup] Node API backend started (PID $BACKEND_PID)"

  # Wait up to 15 seconds for Node API backend to report healthy
  echo "[startup] Awaiting backend database readiness..."
  for i in $(seq 1 15); do
    if python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4700/api/health', timeout=2)" 2>/dev/null; then
      echo "[startup] Backend API is live & healthy on http://127.0.0.1:4700/api"
      break
    fi
    sleep 1
  done
fi

# 2. Configure frontend to connect to local backend on loopback
export API_BASE_URL="http://127.0.0.1:4700/api"
export UI_PORT="${PORT:-8700}"
export UI_HOST="0.0.0.0"

echo "[startup] Launching NiceGUI Frontend on 0.0.0.0:${UI_PORT} (connected to ${API_BASE_URL})..."
cd frontend
exec python3 main.py
