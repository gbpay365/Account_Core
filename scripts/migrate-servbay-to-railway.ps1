# Migrate Account_Core Postgres: ServBay -> Railway
# Requires PostgreSQL 18 pg_dump/psql (ServBay server is PG 18; ServBay bin pg_dump is PG 16).
#
# Usage (PowerShell):
#   $env:RAILWAY_DATABASE_PUBLIC_URL = "postgresql://postgres:PASSWORD@HOST:PORT/railway"
#   .\migrate-servbay-to-railway.ps1
#
# Get RAILWAY_DATABASE_PUBLIC_URL from Railway:
#   Postgres service -> Connect -> Public Network -> copy TCP URL (NOT postgres.railway.internal)

param(
    [string]$ServBayHost = "127.0.0.1",
    [int]$ServBayPort = 5433,
    [string]$ServBayDb = "comptabilite_db",
    [string]$ServBayUser = "postgres",
    [string]$ServBayPassword = "",
    [string]$PgBinDir = "",
    [string]$BackupDir = "$PSScriptRoot\backups",
    [switch]$SkipImport
)

$ErrorActionPreference = "Stop"

function Resolve-PgBin {
    param([string]$PreferredDir)
    if ($PreferredDir -and (Test-Path "$PreferredDir\pg_dump.exe")) {
        return (Resolve-Path $PreferredDir).Path
    }
    $toolDir = Join-Path $PSScriptRoot "tools\pgsql18\pgsql\bin"
    if (Test-Path "$toolDir\pg_dump.exe") { return (Resolve-Path $toolDir).Path }
    if (Test-Path "C:\ServBay\bin\pg_dump.cmd") {
        Write-Warning "Using ServBay pg_dump — requires PG 18 client for ServBay PG 18 server."
        return (Resolve-Path "C:\ServBay\bin").Path
    }
    throw "pg_dump not found. Run scripts\install-pg18-client.ps1 first."
}

function Parse-RailwayUrl {
    param([string]$Url)
    if (-not $Url) { throw "Set RAILWAY_DATABASE_PUBLIC_URL (public TCP URL from Railway Postgres Connect tab)." }
    if ($Url -match "railway\.internal") {
        throw "postgres.railway.internal only works inside Railway. Enable Public Network on Postgres and use the public URL."
    }
    $uri = [Uri]$Url
    if ($uri.Scheme -notin @("postgresql", "postgres")) { throw "URL must start with postgresql://" }
    $user = [Uri]::UnescapeDataString($uri.UserInfo.Split(":")[0])
    $pass = if ($uri.UserInfo.Contains(":")) { [Uri]::UnescapeDataString($uri.UserInfo.Split(":", 2)[1]) } else { "" }
    $hostName = $uri.Host
    $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    $db = $uri.AbsolutePath.TrimStart("/")
    if (-not $db) { $db = "railway" }
    return @{ Host = $hostName; Port = $port; Database = $db; User = $user; Password = $pass }
}

$pgBin = Resolve-PgBin -PreferredDir $PgBinDir
$pgDump = Join-Path $pgBin "pg_dump.exe"
$psql = Join-Path $pgBin "psql.exe"
if (-not (Test-Path $pgDump)) { $pgDump = Join-Path $pgBin "pg_dump.cmd" }
if (-not (Test-Path $psql)) { $psql = Join-Path $pgBin "psql.cmd" }

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dumpFile = Join-Path $BackupDir "comptabilite_db_servbay_$stamp.sql"

Write-Host "=== Step 1: Dump ServBay ($ServBayHost`:$ServBayPort/$ServBayDb) ==="
$env:PGPASSWORD = $ServBayPassword
& $pgDump -h $ServBayHost -p $ServBayPort -U $ServBayUser -d $ServBayDb --no-owner --no-acl --clean --if-exists -f $dumpFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE). Install PG 18 client: scripts\install-pg18-client.ps1" }
Write-Host "Dump saved: $dumpFile ($((Get-Item $dumpFile).Length) bytes)"

if ($SkipImport) {
    Write-Host "SkipImport set — done."
    exit 0
}

Write-Host "=== Step 2: Restore to Railway ==="
$railway = Parse-RailwayUrl -Url $env:RAILWAY_DATABASE_PUBLIC_URL
$env:PGPASSWORD = $railway.Password
$env:PGSSLMODE = "require"

Write-Host "Target: $($railway.Host):$($railway.Port)/$($railway.Database)"
& $psql -h $railway.Host -p $railway.Port -U $railway.User -d $railway.Database -c "SELECT version();"
if ($LASTEXITCODE -ne 0) { throw "Cannot connect to Railway Postgres. Check public URL and SSL." }

& $psql -h $railway.Host -p $railway.Port -U $railway.User -d $railway.Database -f $dumpFile
if ($LASTEXITCODE -ne 0) { throw "psql restore failed (exit $LASTEXITCODE)" }

Write-Host "=== Step 3: Verify ==="
& $psql -h $railway.Host -p $railway.Port -U $railway.User -d $railway.Database -c "SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
& $psql -h $railway.Host -p $railway.Port -U $railway.User -d $railway.Database -c "SELECT \"Email\", \"FullName\" FROM \"Users\" WHERE \"Email\"='admin@comptabilite.cm' LIMIT 1;"

Write-Host ""
Write-Host "Migration complete."
Write-Host "On Railway Account_Core API set: DB_CONNECTION_STRING = \`${{Postgres.DATABASE_URL}} (internal URL is fine for the API service)"
Write-Host "Redeploy API. Login with your ServBay admin credentials (admin@comptabilite.cm)."
