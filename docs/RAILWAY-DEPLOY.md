# Account_Core on Railway (Option A — separate API + UI)

Two Railway **web services** + one **PostgreSQL** plugin.

| Service | Git root | Public URL (example) |
|---------|----------|----------------------|
| **API** | `Account/ComptabiliteAPI` | `https://zaizens-account.up.railway.app` |
| **UI** | `Account/comptabilite-ui` | `https://zaizens-account-ui.up.railway.app` |

The API does **not** serve the React app. Opening the API root shows JSON; use the **UI** URL for login.

---

## 1. PostgreSQL plugin

1. Add **PostgreSQL** to the project (e.g. `account-core-db`).
2. Import your ServBay dump into Railway Postgres (optional if migrations + seed are enough).

---

## 2. API service (`zaizens-account`)

1. **New service** → Deploy from Git → root directory: `Account/ComptabiliteAPI`.
2. Railway detects `railway.toml` + `Dockerfile`.
3. Link Postgres → reference `DATABASE_URL` as `DB_CONNECTION_STRING`.

| Variable | Value |
|----------|--------|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ASPNETCORE_URLS` | `http://0.0.0.0:${{PORT}}` |
| `DB_CONNECTION_STRING` | `${{account-core-db.DATABASE_URL}}` |
| `JWT_KEY` | 32+ character secret |
| `CORS_ORIGINS` | `https://<your-ui-host>.up.railway.app` |

See `ComptabiliteAPI/railway.env.example` for integration variables.

4. Verify: `https://zaizens-account.up.railway.app/health` → `Healthy`.

---

## 3. UI service (`zaizens-account-ui`)

1. **New service** → same repo → root directory: `Account/comptabilite-ui`.
2. **Build variable** (required — Vite bakes this into the bundle):

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | `https://zaizens-account.up.railway.app/api` |

In Railway: **Variables** → add `VITE_API_URL` → enable **Available at build time** (if shown).

3. Deploy uses `Dockerfile` (nginx + SPA).
4. Generate domain → e.g. `https://zaizens-account-ui.up.railway.app`.
5. Update API `CORS_ORIGINS` to that exact UI URL → **redeploy API**.

6. Open the **UI** URL → `/login`.

---

## 4. Custom domains (optional)

| Hostname | Point to |
|----------|----------|
| `account-api.yourdomain.com` | API service |
| `account.yourdomain.com` | UI service |

Update `VITE_API_URL` and `CORS_ORIGINS` to match.

---

## 5. Troubleshooting

| Symptom | Fix |
|---------|-----|
| API `/` returns 404 in browser | Redeploy API after this update — should return JSON; or use `/health`. |
| UI 404 on `/` | Check UI service logs; confirm `dist/` built and nginx listens on `$PORT`. |
| Login fails / CORS error | Set `CORS_ORIGINS` on API to the **UI** origin (scheme + host, no trailing slash). |
| API calls go to `localhost:5072` | Rebuild UI with correct `VITE_API_URL` at **build** time. |
| `JWT_KEY must be configured` | Set `JWT_KEY` on API (32+ chars). |

---

## 6. Local development (unchanged)

```bash
# API
cd Account/ComptabiliteAPI
dotnet run

# UI
cd Account/comptabilite-ui
npm install
npm run dev
```

UI: http://localhost:5174 → API: http://localhost:5072
