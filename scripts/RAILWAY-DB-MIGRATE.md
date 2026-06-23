# Migrate Account_Core DB: ServBay → Railway Postgres

## Source (ServBay)

| Setting | Value |
|---------|--------|
| Host | `127.0.0.1` |
| Port | `5433` |
| Database | `comptabilite_db` |
| User | `postgres` |
| Password | (empty) |

## Target (Railway)

**Important:** `postgres.railway.internal` only works **inside** Railway (API container → Postgres).  
You **cannot** import from your PC using that host.

### Get the public URL

1. Railway → **Postgres** service → **Connect**
2. Enable **Public Network** (TCP proxy) if not already on
3. Copy the **public** connection URL, e.g.  
   `postgresql://postgres:PASSWORD@roundhouse.proxy.rlwy.net:12345/railway`

Do **not** commit this URL or password to git.

## Steps

### 1. Install PG 18 client (one time)

ServBay runs PostgreSQL **18**; ServBay’s default `pg_dump` is **16** and will fail.

```powershell
cd C:\Account_Core\Account\scripts
.\install-pg18-client.ps1
```

### 2. Run migration

```powershell
$env:RAILWAY_DATABASE_PUBLIC_URL = "postgresql://postgres:YOUR_PASSWORD@YOUR_PUBLIC_HOST:PORT/railway"
.\migrate-servbay-to-railway.ps1
```

Dump-only (no import):

```powershell
.\migrate-servbay-to-railway.ps1 -SkipImport
```

Backups are saved under `scripts/backups/`.

### 3. Point API at Railway Postgres

On **Account_Core** API service:

| Variable | Value |
|----------|--------|
| `DB_CONNECTION_STRING` | `${{Postgres.DATABASE_URL}}` |

Use the **internal** reference for the running API — only the migration needs the **public** URL.

Redeploy API after migration.

### 4. Login

Use the same **admin email/password** as ServBay (e.g. `admin@comptabilite.cm` and your local password).  
The migration copies the `Users` table including password hashes.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `server version mismatch` | Run `install-pg18-client.ps1` |
| `railway.internal` / connection refused | Use **public** URL, not internal |
| SSL errors | Script sets `PGSSLMODE=require` |
| Login 401 after migrate | Password is whatever was in ServBay — not reset by seed |

## Security

Rotate the Railway Postgres password after migration if it was shared in chat or tickets.
