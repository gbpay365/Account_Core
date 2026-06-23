# Account_Core on Railway (Option A — separate API + UI)

Two Railway **web services** + one **PostgreSQL** plugin.

| Service | Git root | Public URL (example) |
|---------|----------|----------------------|
| **API** | `ComptabiliteAPI` | `https://zaizens-account.up.railway.app` |
| **UI** | `comptabilite-ui` | `https://zaizens-account-ui.up.railway.app` |

GitHub repo: `gbpay365/Account_Core` — service root paths are **relative to repo root** (`ComptabiliteAPI`, `comptabilite-ui`). Do **not** use an `Account/` prefix.

The API does **not** serve the React app. Opening the API root shows JSON; use the **UI** URL for login.

---

## 1. PostgreSQL plugin

1. Add **PostgreSQL** to the project (e.g. `account-core-db`).
2. Import your ServBay dump into Railway Postgres (optional if migrations + seed are enough).

---

## 2. API service (`zaizens-account`)

1. **New service** → Deploy from Git → root directory: `ComptabiliteAPI`.
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

1. **New service** in the same Railway project → **Deploy from GitHub** (same repo as API).
2. **Settings → Root directory:** `comptabilite-ui` (**required** — without this, build fails with “Failed to read app source directory”).
3. **Settings → Build:** uses `Dockerfile` + nginx (no `npm` needed at runtime).
4. **Variables** — add before deploy:

| Variable | Value | Build-time? |
|----------|--------|-------------|
| `VITE_API_URL` | `https://zaizens-account.up.railway.app/api` | **Yes** |

5. **Deploy** → wait for **Success** in Deployments tab.
6. **Settings → Networking → Generate domain** → e.g. `zaizens-account-ui.up.railway.app`.
7. On **API** service, set `CORS_ORIGINS` to that UI URL → redeploy API.

8. Open the **UI** URL → `/login`.

### “The train has not arrived at the station”

Railway shows this when the **UI service has no successful deployment** linked to that domain.

| Check | Action |
|-------|--------|
| Root directory | Must be `comptabilite-ui`, not `Account/comptabilite-ui` or repo root |
| Deployment status | Deployments tab must show **Active / Success** |
| Build logs | Fix `npm run build` errors (often missing `VITE_API_URL`) |
| Domain | Generate domain **after** first successful deploy |
| Wrong service | Domain must belong to the **UI** service, not API |

Alternative: set builder to **Dockerfile** in Railway settings if you prefer nginx (`Dockerfile` in this folder).

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
cd ComptabiliteAPI
dotnet run

# UI
cd comptabilite-ui
npm install
npm run dev
```

UI: http://localhost:5174 → API: http://localhost:5072
