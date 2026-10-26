# Deployment notes

CVPilot is four pieces: **web** (static files + nginx), **gateway** (Node), **ml-service** (Python) and **MongoDB**.
Only `web` (and optionally the gateway) should be reachable from the internet. The ML service and the database must not be.

> These notes describe a sound setup but were **not exercised against a real cloud deployment**. The Docker images
> and `docker compose up` were not built or run in the development sandbox (no Docker daemon was available).

## 1. Secrets and configuration

| Where | Variable | Notes |
| --- | --- | --- |
| gateway | `JWT_SECRET` | >= 32 random characters; rotate to invalidate all sessions |
| gateway, ml-service | `ML_SHARED_SECRET` | same random value in both |
| gateway | `MONGODB_URI` | Atlas `mongodb+srv://...`; create a user limited to the `cvpilot` database |
| gateway | `CORS_ORIGINS` | exact public origin(s), e.g. `https://cvpilot.example.com`; also used by the Origin check |
| gateway | `NODE_ENV=production` | enables `Secure` cookies and `trust proxy` |
| ml-service | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_COUNTRY` | job search, insights, roadmap |
| ml-service | `GEMINI_API_KEY` | optional; templates are used without it |

Keep secrets in your platform's secret store, never in the image or the repository. `.env` files are git-ignored.

## 2. HTTPS and cookies

Sessions are `httpOnly` cookies, `Secure` when `NODE_ENV=production`, so the site **must** be served over HTTPS.
Serve the web app and the API from the same origin (the bundled nginx proxies `/api/` to the gateway), which keeps the
cookie first-party and lets `SameSite=Lax` do its job. If you must split origins, set `COOKIE_SAMESITE=none` (requires
HTTPS), list the web origin in `CORS_ORIGINS`, and re-test login.

Terminate TLS in front of the `web` container (a load balancer, Caddy, Traefik, or nginx with certificates).

## 3. MongoDB Atlas

1. Create a cluster and a database user; allow only your servers' IPs.
2. Put the SRV connection string in `MONGODB_URI` (the compose file then ignores the bundled `mongo` service; remove it
   from `depends_on` or leave it unused).
3. Indexes are created by Mongoose on start (`autoIndex`); for large clusters create them out of band first
   (unique: `users.email`, `marketinsights.{role,location}`, `joblistings.{source,sourceId}`, `resumes.share.tokenHash`
   (sparse), `roadmaps.userId`).
4. Enable backups. User data = `users`, `resumes`, `roadmaps`; `joblistings` and `marketinsights` are re-fetchable.

## 4. ML service

* The image installs CPU PyTorch and bakes the `all-MiniLM-L6-v2` model in at build time, so cold starts do not download
  it. Allow roughly 1-2 GB RAM. The first `/score` after a restart loads the model (about 8 s on the test machine).
* **Scam classifier**: train it with `python eval/train_scam_classifier.py` on your copy of EMSCAD, then mount the
  resulting `ml-service/models/` read-only at `/srv/models` (compose does this). Without it the service runs rule-only
  and the UI says so (`Settings -> Service status`).
* Run more than one replica behind the gateway if needed; it is stateless apart from an in-memory embedding cache.

## 5. Scaling and limits

* Rate limits (login/register, analysis, public share view) are **in memory per gateway process**. With several
  gateway replicas use a shared store (e.g. `rate-limit-redis`) or enforce limits at the load balancer.
* Adzuna has API quotas. The gateway caches market insights per role/location for 10 minutes and the roadmap reuses an
  insight up to 7 days old; adjust `INSIGHT_TTL_MS` (`gateway/src/services/market.ts`) if needed.
* Gemini calls are small (one snippet, or score + keyword lists, or role + skill names) and fall back to templates on error.

## 6. Health and monitoring

* `GET /health` (gateway, liveness) and `GET /ready` (readiness: MongoDB reachable and ML service answering with the
  shared secret). ML: `GET /health`.
* Every response carries `X-Request-Id`; error bodies include it and the server logs a JSON line with the same id.
* Logs contain no passwords, tokens, resume text or API keys. Adzuna errors are re-raised without the request URL
  (which would contain the API key).

## 7. Operational checklist

- [ ] `NODE_ENV=production`, HTTPS in front, `CORS_ORIGINS` = the public origin
- [ ] Unique `JWT_SECRET` and `ML_SHARED_SECRET`; no `SEED_DEMO_PASSWORD`; do not run the seed script
- [ ] MongoDB and ml-service not publicly reachable
- [ ] Atlas backups on; Adzuna/Gemini keys only on the ML service
- [ ] Classifier trained and mounted (or accept rule-only mode)
- [ ] Privacy notice reviewed for your jurisdiction (resume text can reach Google Gemini only via the explicit
      "Improve wording" action; account export and deletion are available in Settings)
