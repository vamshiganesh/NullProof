# Deploy the Relayer API

Host **only** the relayer (`pnpm oracle:api`). The daily OFAC oracle cron runs in GitHub Actions (`update-sanctions.yml`), not on this service.

## What this service does

- `GET /api/health` — liveness check
- `POST /api/submit` — relayer broadcasts `SubmissionRouter.submitCompliant` on Sepolia

## Required environment variables

| Variable | Example / notes |
|----------|-----------------|
| `CORS_ORIGIN` | `https://your-app.vercel.app` (no trailing slash) |
| `RELAYER_PRIVATE_KEY` | From `oracle/.env` — wallet `0xB575…946a` |
| `SUBMISSION_ROUTER_ADDRESS` | `0x094AC492023157c9e2F228e3620e31C249cd3035` |
| `COMPLIANCE_GATE_ADDRESS` | `0x1906B284ef0DA8Dc41b531bb08E2Ae9eEAAeEA5f` |
| `SEPOLIA_RPC_URL` | Alchemy Sepolia HTTPS URL |
| `CHAIN_ID` | `11155111` |
| `REQUIRE_RELAYER_AUTH` | `true` (or `false` for simpler UX) |

Do **not** set `PORT` on Railway or Render — the platform injects it.

Do **not** deploy `pnpm oracle:run` here — that is the root-publisher cron for GitHub Actions.

---

## Option A: Render (recommended if you cannot pay)

**Why:** No 27-day trial cutoff. Free tier has no credit card requirement.

**Tradeoff:** Service sleeps after 15 minutes with no traffic (~30–60s cold start on next request). Fine for portfolio demos; ping `/api/health` every 10 minutes from [cron-job.org](https://cron-job.org) (free) to stay warm.

### Steps

1. Sign up at [render.com](https://render.com).
2. **New → Blueprint** → connect `vamshiganesh/NullProof` → apply `render.yaml`.
3. In the service **Environment** tab, set:
   - `CORS_ORIGIN`
   - `RELAYER_PRIVATE_KEY`
   - `SEPOLIA_RPC_URL`
4. Wait for deploy → copy public URL, e.g. `https://nullproof-relayer.onrender.com`.
5. Set `VITE_ORACLE_BASE_URL` on Vercel to that URL.
6. (Optional) Add cron-job.org: `GET https://nullproof-relayer.onrender.com/api/health` every 10 minutes.

---

## Option B: Railway

**Why:** Fast Docker deploys, simple UI.

**Tradeoff:** Hobby plan is ~$5/month credit after trial; not a long-term free option.

### Fix “error deploying from source”

Railway often fails when it uses **Nixpacks** on the monorepo root instead of Docker.

1. Open service → **Settings** → **Build**:
   - **Builder:** Dockerfile
   - **Dockerfile path:** `oracle/Dockerfile`
   - **Root directory:** leave **empty** (repo root). Do not set `oracle/` — the Dockerfile `COPY` paths assume repo root context.
2. **Settings** → **Deploy** → **Health check path:** `/api/health`
3. **Variables** → add all relayer env vars (see table above). Use **Raw Editor** to paste from `oracle/.env` (relayer keys only).
4. **Settings** → **Networking** → **Generate domain** (service is “Unexposed” until you do this).
5. Click **Deploy** (or push to `main` if repo is connected).

`railway.toml` in the repo root configures Dockerfile build automatically once Builder is set to Dockerfile.

### Verify

```bash
curl https://YOUR-RAILWAY-DOMAIN.up.railway.app/api/health
# {"ok":true,"service":"nullproof-relayer"}
```

---

## Option C: Fly.io

Free allowance exists but often requires a card for verification. Use if you already have a Fly account.

```bash
fly launch --dockerfile oracle/Dockerfile --no-deploy
fly secrets set RELAYER_PRIVATE_KEY=... SEPOLIA_RPC_URL=... CORS_ORIGIN=...
fly deploy
```

---

## After deploy

1. `VITE_ORACLE_BASE_URL` on Vercel → relayer HTTPS URL
2. `CORS_ORIGIN` on relayer → Vercel HTTPS URL (redeploy relayer after changing)
3. Fund relayer wallet `0xB575…946a` with Sepolia ETH
4. Test: Vercel app → prove → submit via relayer

## Local Docker test (before cloud deploy)

```bash
docker build -f oracle/Dockerfile -t nullproof-relayer .
docker run -p 3001:3001 --env-file oracle/.env nullproof-relayer
curl http://localhost:3001/api/health
```
