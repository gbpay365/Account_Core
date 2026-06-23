#!/bin/sh
set -e
PORT="${PORT:-8080}"
export ASPNETCORE_HTTP_PORTS="$PORT"
export ASPNETCORE_URLS="http://0.0.0.0:${PORT}"
echo "Starting ComptabiliteAPI on port ${PORT}"
exec dotnet ComptabiliteAPI.dll
