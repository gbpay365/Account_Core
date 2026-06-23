#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required (link Postgres plugin to this service)."
  exit 1
fi

echo "Connecting to Railway Postgres..."
psql "$DATABASE_URL" -c "SELECT version();"

echo "Importing ServBay dump (this may take a few minutes)..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /import/dump.sql

echo "Verifying table count..."
psql "$DATABASE_URL" -c "SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
psql "$DATABASE_URL" -c "SELECT \"Email\", \"FullName\" FROM \"Users\" WHERE \"Email\"='admin@comptabilite.cm' LIMIT 1;"

echo "Import complete."
