# Railway UI service — read this first

The domain `zaizens-account-ui.up.railway.app` only works after a **separate UI service** deploys successfully.

## Railway checklist (5 minutes)

1. **New service** in the same project (do not reuse the API service).
2. **Settings → Source:** connect your GitHub repo.
3. **Settings → Root directory:** `Account/comptabilite-ui` ← **required**
4. **Variables:**
   - `VITE_API_URL` = `https://zaizens-account.up.railway.app/api`
   - Mark **Available at build time** if Railway shows that toggle.
5. **Deploy** → open **Deployments** → status must be **Success** (green).
6. **Settings → Networking → Generate domain** (or attach `zaizens-account-ui`).
7. On **API** service, set `CORS_ORIGINS=https://zaizens-account-ui.up.railway.app` and redeploy API.

## “Train has not arrived at the station”

This is Railway’s edge page — **no running deployment** is linked to that domain.

| Cause | Fix |
|-------|-----|
| Domain on wrong service | Attach domain to the **UI** service, not API |
| No deploy yet | Connect Git + deploy UI service |
| Root directory wrong | Must be `Account/comptabilite-ui` |
| Build failed | Read **Build logs** in Deployments tab |

## Verify locally

```bash
cd Account/comptabilite-ui
npm ci
npm run build
npm start
# open http://localhost:3000/login
```

## URLs

| URL | What |
|-----|------|
| `zaizens-account.up.railway.app` | API only |
| `zaizens-account-ui.up.railway.app` | **Login UI** |
