# CVPilot

Candidate-facing career intelligence: resume builder, semantic ATS analyzer, job matching, market insights,
skill-gap roadmap and scam detection, linked in one data flow.

> **Status: Phase 1 of 7** — scaffold, database models, and authentication. Resume builder, ATS, job matching,
> scam detection, insights and roadmap are **not built yet**. The dashboard shows only your account.

## Architecture

```
browser ──► web (React/Vite) ──/api──► gateway (Express) ──shared secret──► ml-service (FastAPI)
                                            │                                   │
                                         MongoDB                       Gemini, Adzuna (later phases)
```

The browser only ever talks to the gateway. API keys live in server-side env vars.

## Run with Docker

```bash
cp .env.example .env
# put two random secrets in .env (JWT_SECRET, ML_SHARED_SECRET):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
docker compose up --build
```

Open http://localhost:8080 (web). Gateway health: http://localhost:4000/health.

## Run without Docker (development)

```bash
# 1. MongoDB on localhost:27017 (e.g. `docker run -p 27017:27017 mongo:7`)
# 2. Gateway
cd gateway && cp .env.example .env   # set JWT_SECRET (>= 32 chars)
npm install && npm run dev            # http://localhost:4000
# 3. Web (proxies /api to the gateway)
cd web && npm install && npm run dev  # http://localhost:5173
# 4. ML service (optional in Phase 1)
cd ml-service && python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
ML_SHARED_SECRET=... uvicorn app.main:app --port 8000
```

## Tests and checks

```bash
cd gateway && npm run typecheck && npm run lint && npm test   # API tests use mongodb-memory-server (downloads a mongod binary on first run)
cd web && npm run typecheck && npm run lint && npm test
cd ml-service && pytest
```

## Environment variables

| Service | Variable | Notes |
| --- | --- | --- |
| gateway | `MONGODB_URI`, `JWT_SECRET` (>= 32 chars), `JWT_EXPIRES_IN`, `BCRYPT_COST` (>= 12), `CORS_ORIGINS`, `COOKIE_SAMESITE`, `ML_SERVICE_URL`, `ML_SHARED_SECRET` | see `gateway/.env.example` |
| ml-service | `ML_SHARED_SECRET`, `GEMINI_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_COUNTRY` | Gemini/Adzuna unused until Phases 3–4 |

Getting keys (needed later): Gemini — https://aistudio.google.com/apikey; Adzuna — https://developer.adzuna.com/ (free tier).

## Auth design (Phase 1)

- Passwords: bcrypt, cost >= 12 (startup fails if configured lower); max 72 bytes to avoid silent truncation.
- Session: HS256 JWT in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production), 30 min lifetime.
- Login returns the same error for unknown email and wrong password and does a dummy hash comparison for unknown emails.
- zod validation on every endpoint; structured errors `{ "error": { "code", "message", "details?" } }`.
- Rate limit on login/register (20 per 15 min per IP); strict CORS allow-list; helmet.
- API is versioned under `/api/v1`: `POST /auth/register|login|logout`, `GET /auth/me`, `GET|PUT /profile`.

## Known limitations / assumptions (Phase 1)

- No refresh token: sessions end after the access-token lifetime and the user signs in again.
- CSRF defence relies on `SameSite` cookies, the strict CORS allow-list and JSON-only bodies; no CSRF token.
- Rate limiting is in-memory per process; use a shared store if the gateway is scaled out.
- Resume sharing stores only a SHA-256 hash of the share token (the schema is ready; the feature arrives in Phase 2).
- `ml-service` currently exposes only `/health` and `/internal/ping`.
