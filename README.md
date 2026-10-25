# CVPilot

Candidate-facing career intelligence: resume builder, semantic ATS analyzer, job matching, market insights,
skill-gap roadmap and scam detection, linked in one data flow.

> **Status: Phase 3 of 7** — auth, resume builder (3 templates, live preview, PDF/DOCX export, share links), and the
> semantic ATS analyzer. Job matching, scam detection, insights and roadmap are **not built yet**; those sidebar items are marked "Soon". The dashboard shows only your real data.

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

## Resume builder (Phase 2)

- Resumes: `GET|POST /resumes`, `GET|PUT|DELETE /resumes/:id`, `GET /resumes/templates`. Max 25 per user. Every
  lookup is scoped to the signed-in user; other users' ids return 404.
- Export: `GET /resumes/:id/export?format=pdf|docx` (pdfkit / docx), styled per template.
- Sharing: `POST /resumes/:id/share` (optional `expiresInDays`) returns a 256-bit token **once**; only its SHA-256 is
  stored. Creating a new link replaces the old one. `DELETE /resumes/:id/share` revokes. The public read-only view is
  `GET /public/resumes/:token` (rate-limited, `noindex`, exposes only title, template and content).
- Phrasing suggestions: `POST /resumes/suggest` -> gateway -> ML service `/suggest` -> Gemini. Only the one snippet the
  user clicks "Improve wording" on is sent. Without `GEMINI_API_KEY` the UI shows "Gemini is not configured".
- Editing a resume clears any stored ATS result, because it would be stale.

## ATS analyzer (Phase 3)

`POST /api/v1/resumes/:id/analyze { jobDescription }` -> gateway builds plain text from the resume -> ML `POST /score`:

1. `e_R`, `e_J` = sentence-transformers embeddings (default `all-MiniLM-L6-v2`, set `EMBEDDING_MODEL` to change).
2. `MatchScore = round(100 * max(0, cosine(e_R, e_J)))`.
3. Keyword sets: lowercase, strip punctuation, drop stop words and tokens < 3 characters, lemmatize (`simplemma` plus
   a plural-folding step so "API"/"APIs" match). `M = W_R ∩ W_J`, `Γ = W_J \ W_R`, ordered by frequency in the job description.
4. Only `(score, M, Γ)` go to Gemini (temperature 0.1) for a short explanation; if Gemini is missing or fails, a
   deterministic template is used. The UI shows which one produced the text.

The result (score, matched, missing, explanation, model, raw cosine) is stored on the resume and cleared when the resume
is edited. The job description itself is not stored, only its hash.

Documented deviations / caveats in `ml-service/app/keywords.py`: a small allow-list of short technical terms
(`c++`, `c#`, `ai`, `ml`, `ui`, `ux`, `qa`, `ci/cd`, `.net`, `node.js`) is kept even though the spec drops tokens under
3 characters, and job-ad boilerplate (`GENERIC_TERMS`, e.g. "experience", "team", "familiarity") is removed from both
sets. Keywords are single words; multi-word skills ("machine learning") appear as separate words.

## Known limitations / assumptions

- No refresh token: sessions end after the access-token lifetime and the user signs in again.
- CSRF defence relies on `SameSite` cookies, the strict CORS allow-list and JSON-only bodies; no CSRF token.
- Rate limiting is in-memory per process; use a shared store if the gateway is scaled out.
- Resume sharing stores only a SHA-256 hash of the share token.
- `ml-service` currently exposes `/health`, `/internal/ping`, `/suggest` and `/score`.
- MiniLM reads only the first ~256 tokens of each text. Longer resumes/job descriptions are truncated for the *score*
  (the UI warns when this happens); the keyword lists use the full text.
- The score measures semantic similarity, not a probability of passing a real employer's ATS.
- The first `/score` call after the ML service starts loads the model (about 8 s on the test machine); later calls took
  about 1.5 s. The Docker image downloads the model at build time. On Python 3.11 in Docker this is untested here.
- The share URL cannot be shown again after creation (only a hash is stored); users create a new link instead.
- The in-browser preview and the PDF/DOCX exports are separate renderers kept visually close but not pixel-identical;
  DOCX output was checked for valid file structure only, not opened in Word.
- Gemini suggestions were tested with the Gemini client mocked and with the key absent; no live Gemini call was made.
