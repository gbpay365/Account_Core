#!/bin/sh
set -e
export ASPNETCORE_URLS="http://0.0.0.0:${PORT:-8080}"
echo "Starting ComptabiliteAPI on ${ASPNETCORE_URLS}"
exec dotnet ComptabiliteAPI.dll
