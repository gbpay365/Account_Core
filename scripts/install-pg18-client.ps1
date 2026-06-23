# Download PostgreSQL 18 client binaries (pg_dump 18) for ServBay PG 18 server
$zip = "$env:TEMP\pgsql18.zip"
$url = "https://get.enterprisedb.com/postgresql/postgresql-18.4-1-windows-x64-binaries.zip"
$dest = Join-Path $PSScriptRoot "tools\pgsql18"

Write-Host "Downloading PostgreSQL 18 binaries (~320 MB)..."
curl.exe -L -o $zip $url
if ($LASTEXITCODE -ne 0) { throw "Download failed" }
$expected = 337444127
$size = (Get-Item $zip).Length
if ($size -lt ($expected * 0.95)) { throw "Download incomplete ($size / $expected bytes)" }

Write-Host "Extracting to $dest ..."
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $dest -Force
$pgDump = Get-ChildItem $dest -Recurse -Filter "pg_dump.exe" | Select-Object -First 1
& $pgDump.FullName --version
Write-Host "OK: $($pgDump.FullName)"
