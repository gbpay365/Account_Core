#!/bin/sh
set -e

echo "=== Starting LedgerCore Health Unified Container ==="
rm -f /tmp/backend.log

# 1. Start Node.js API backend on internal port 4700
echo "[startup] Starting LedgerCore Node API backend on internal port 4700..."
BACKEND_PORT=4700 PORT=4700 node backend/src/server.js 2>&1 | tee /tmp/backend.log &
BACKEND_PID=$!
echo "[startup] Node API backend started (PID $BACKEND_PID)"

# Wait up to 25 seconds for Node API backend to report healthy
echo "[startup] Awaiting backend database readiness on port 4700..."
READY=0
for i in $(seq 1 25); do
  if python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4700/api/health', timeout=2)" 2>/dev/null; then
    echo "[startup] Backend API is live & healthy on http://127.0.0.1:4700/api"
    READY=1
    break
  fi
  if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "[startup] WARNING: Node backend process $BACKEND_PID exited early!"
    cat /tmp/backend.log
    break
  fi
  sleep 1
done

if [ "$READY" -eq 0 ]; then
  echo "[startup] Backend was not ready after 25s. Recent logs:"
  cat /tmp/backend.log 2>/dev/null || true
fi

# 2. Configure frontend to connect to local backend on loopback
export API_BASE_URL="http://127.0.0.1:4700/api"
export UI_PORT="${PORT:-8700}"
export UI_HOST="0.0.0.0"

echo "[startup] Launching NiceGUI Frontend on 0.0.0.0:${UI_PORT}..."
cd frontend
exec python3 main.py
