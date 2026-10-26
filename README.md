# CVPilot

A candidate-facing career-intelligence app. Six capabilities share one data flow:

1. **Resume builder**: structured form, 3 templates, live preview, PDF/DOCX export, revocable share links.
2. **Semantic ATS analyzer**: embedding similarity plus matched/missing keywords, with an explanation.
3. **Job matching**: live Adzuna listings ranked against your resume, each screened for scams.
4. **Market intelligence**: skill demand and salary statistics per role/location.
5. **Skill-gap roadmap**: the in-demand skills your resume lacks, with milestone tracking.
6. **Scam detection**: data-driven rules plus a trained text classifier, with the evidence shown.

Skills in your resume feed matching; fetched listings feed market aggregation; aggregated demand feeds the roadmap.
Every score, label or explanation in the UI shows its evidence (matched/missing keywords, fired indicators with the quoted
text, demand counts).

**Status: all 7 build phases are implemented.** See [Testing](#testing-what-was-and-was-not-run) for exactly what was
run and what was not. Deployment guidance is in [DEPLOYMENT.md](DEPLOYMENT.md); evaluation tooling in [eval/](eval/README.md).

## Architecture

```
browser ──► web (React + Vite, nginx) ──/api──► gateway (Node/Express) ──x-ml-secret──► ml-service (FastAPI)
                                                     │                                      │
                                                  MongoDB                    sentence-transformers, scikit-learn,
                                                                             pandas · calls Gemini + Adzuna
```

* The browser talks **only** to the gateway. The gateway handles auth, CRUD, sharing and orchestration.
* The ML service is the **only** component that calls Gemini or Adzuna; all API keys are server-side environment variables.
* Gateway ⇄ ML service use an internal REST contract protected by a shared-secret header (constant-time comparison).

| Folder | What |
| --- | --- |
| `web/` | React 19 + TypeScript (Vite), Tailwind 4, React Router |
| `gateway/` | Express 5 + TypeScript (strict), Mongoose, zod, JWT cookie sessions |
| `ml-service/` | FastAPI, sentence-transformers, scikit-learn, pandas, simplemma |
| `eval/` | Training and evaluation scripts (no fabricated numbers) |

## Quick start (Docker)

```bash
cp .env.example .env
# Put two different random secrets in .env (JWT_SECRET, ML_SHARED_SECRET):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Add ADZUNA_APP_ID / ADZUNA_APP_KEY (and optionally GEMINI_API_KEY) to .env
docker compose up --build
```

Open <http://localhost:8080>, register, then check **Settings → Service status** to see which integrations are on.
(A labelled demo account can be created with `npm run seed`; see the next section.)

### Getting API keys

* **Adzuna** (job data, free tier): create an app at <https://developer.adzuna.com/> and copy the *Application ID* and
  *Application Key* into `ADZUNA_APP_ID` / `ADZUNA_APP_KEY`. `ADZUNA_COUNTRY` defaults to `in`.
* **Gemini** (optional text generation): create a key at <https://aistudio.google.com/apikey> and set `GEMINI_API_KEY`.
  Without it, explanations and roadmap tips fall back to deterministic text, and "Improve wording" is unavailable.
* **EMSCAD dataset** (only to train the scam classifier): see [eval/README.md](eval/README.md).

Job search, insights and the roadmap need Adzuna keys. Everything else (resume builder, ATS score, Scam Radar) works without them.

## Running without Docker

```bash
# MongoDB on localhost:27017  (e.g. docker run -p 27017:27017 mongo:7)

# ML service (Python 3.11+; the first run downloads the embedding model)
cd ml-service && python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
ML_SHARED_SECRET=... ADZUNA_APP_ID=... ADZUNA_APP_KEY=... uvicorn app.main:app --port 8000

# Gateway
cd gateway && cp .env.example .env     # set JWT_SECRET (>= 32 chars) and ML_SHARED_SECRET
npm install && npm run dev             # http://localhost:4000
npm run seed                           # optional: one clearly labelled DEMO DATA account + resume

# Web (proxies /api to the gateway)
cd web && npm install && npm run dev   # http://localhost:5173
```

### Training the scam classifier (optional, recommended)

```bash
pip install -r eval/requirements.txt
# place EMSCAD at eval/data/fake_job_postings.csv, then:
python eval/train_scam_classifier.py
```

This writes `ml-service/models/scam_clf.joblib` and the tuned thresholds/weights. Restart the ML service and scam checks
switch from **rule-only** to **hybrid** mode automatically (the UI shows which mode is active).

## Environment variables

| Service | Variable | Default | Notes |
| --- | --- | --- | --- |
| gateway | `MONGODB_URI` | – | Atlas SRV string in production |
| gateway | `JWT_SECRET` | – | ≥ 32 characters |
| gateway | `JWT_EXPIRES_IN` | `30m` | short-lived access token |
| gateway | `BCRYPT_COST` | `12` | startup fails if < 12 |
| gateway | `CORS_ORIGINS` | `http://localhost:5173` | strict allow-list; also used by the Origin check |
| gateway | `COOKIE_SAMESITE` | `lax` | `none` requires HTTPS |
| gateway | `ML_SERVICE_URL`, `ML_SHARED_SECRET` | – | internal contract |
| ml-service | `ML_SHARED_SECRET` | – | must match the gateway |
| ml-service | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_COUNTRY` | –, –, `in` | `ADZUNA_BASE_URL` overrides the API root |
| ml-service | `GEMINI_API_KEY`, `GEMINI_MODEL` | –, `gemini-2.0-flash` | optional |
| ml-service | `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | any sentence-transformers model |
| ml-service | `SCAM_THETA1`, `SCAM_THETA2`, `SCAM_W_R`, `SCAM_RULE_FLOOR`, `SCAM_RULES_PATH`, `SCAM_MODEL_PATH` | 0.25, 0.5, 0.5, 1 | see below |

## How the algorithms work

**ATS score.** `MatchScore = round(100 · max(0, cos(f(R), f(J))))` with `f` = sentence-transformers (default
`all-MiniLM-L6-v2`). Keyword sets: lowercase, strip punctuation, drop stop words and tokens shorter than 3 characters,
lemmatize (simplemma plus a plural-folding step so "API"/"APIs" match); `M = W_R ∩ W_J`, `Γ = W_J \ W_R`. Only
`(score, M, Γ)` go to Gemini (temperature 0.1); on any failure a deterministic template is returned. The UI states that the
value is a rescaled similarity, **not a probability**.

**Job matching.** Fetch listings from Adzuna, embed the profile (target role, profile, optional resume) and each listing
(embeddings cached by model + text hash), keep the top K by cosine with a size-K min-heap, screen every result. High-risk
listings are labelled, never hidden.

**Scam detection.** Four data-driven rule indicators (`ml-service/app/data/scam_rules.json`): h1 upfront fee/deposit,
h2 bank details/OTP/wire transfer, h3 guaranteed hiring/"no interview", h4 personal email domain. `rho = fired / m`.
Negations such as "no registration fee" do not fire (and never reach across a sentence). Classifier probability
`P_clf` comes from TF-IDF + logistic regression trained on EMSCAD. Risk `r = w_r·rho + w_c·P_clf` (`w_r + w_c = 1`);
bands: safe `r < θ1`, caution `θ1 ≤ r < θ2`, else high (defaults 0.25 / 0.5, or the values tuned on validation data).
With no model file it runs **rule-only** (`w_r = 1, w_c = 0`) and says so. With 4 rules, one fired rule = 0.25 (caution),
two = 0.5 (high).
*Deviation:* by default the hybrid risk is floored at the rule-only risk (`r = max(r, rho)`; `SCAM_RULE_FLOOR=0` disables
it) so explicit rule evidence cannot be diluted by the classifier; see the evaluation below for why this matters.

**Market intelligence.** Listings for a role/location are aggregated with pandas: per-skill listing counts (a listing counts
a skill at most once) against a curated skill lexicon (`ml-service/app/data/skills_lexicon.json`, multi-word and alias aware),
and salary statistics (count, min, max, mean, median, quartiles) from range midpoints, with the share that Adzuna
*estimated* shown. Results are stored in `MarketInsights` (cached 10 minutes per role/location).

**Roadmap.** `d(s) = listings containing s / n`; `S_role = {s : d(s) ≥ τ}` (τ configurable, default 0.1);
`G = S_role \ S_user`; the roadmap is `G` by descending `d(s)` (max 15 items). Your skills = profile skills ∪ resume skills ∪
lexicon skills found in the resume text. Gemini gets only the role and skill names to write tips (template fallback).
Milestones are *not started / in progress / completed*; `Progress = 100 · |completed| / |roadmap|`. Rebuilding keeps
progress on skills that remain.

## API (gateway, versioned under `/api/v1`)

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Profile | `GET /profile`, `PUT /profile` |
| Resumes | `GET/POST /resumes`, `GET /resumes/templates`, `GET/PUT/DELETE /resumes/:id`, `POST /resumes/:id/analyze`, `POST/DELETE /resumes/:id/share`, `GET /resumes/:id/export?format=pdf\|docx`, `POST /resumes/suggest` |
| Public | `GET /public/resumes/:token` (read-only shared resume) |
| Jobs | `POST /jobs/search`, `POST /jobs/screen` |
| Insights | `GET /insights?role&location`, `POST /insights/refresh` |
| Roadmap | `GET /roadmap`, `POST /roadmap/generate`, `PATCH /roadmap/items` |
| Account | `GET /account/export`, `POST /account/delete` |
| Ops | `GET /status` (auth), unversioned `GET /health`, `GET /ready` |

ML service (internal, shared-secret header except `/health`): `/health`, `/internal/ping`, `/internal/status`, `/score`,
`/screen`, `/rank`, `/aggregate`, `/roadmap`, `/suggest`. Errors everywhere use
`{ "error": { "code", "message", "details?", "requestId" } }`.

## Security and privacy

* Passwords: bcrypt cost ≥ 12 (enforced at startup), ≤ 72 bytes; identical error and a dummy hash comparison for unknown emails.
* Sessions: HS256 JWT, 30 min, in an `httpOnly` cookie (`Secure` in production, `SameSite=Lax`). CSRF defence in depth: JSON-only
  bodies, strict CORS allow-list, and a server-side **Origin check** that rejects state-changing requests from other origins.
* zod validation on every endpoint; 256 KB body limit; helmet; rate limits on login/register, analysis routes and the public
  share view; nginx adds a CSP and security headers for the web app.
* Authorization: every resume/roadmap/profile query is scoped to the signed-in user; other users get 404.
* Share links: 256-bit token shown once, only its SHA-256 stored; optional expiry; revoke or re-share invalidates the old
  link; `noindex`; only title/template/content are exposed.
* Privacy: resume text goes to Google Gemini **only** when you click "Improve wording" (that one snippet). ATS explanations
  send only the score and keyword lists; roadmap tips send only the role and skill names; scam checks and job matching send
  nothing to an LLM. A visible notice says so on the sign-up page, builder, ATS page and in Settings.
* Data rights: Settings → export everything as JSON; delete the account (password required), which removes the user, all
  resumes (share links stop working) and the roadmap.
* Secrets live only in server environment variables; Adzuna errors are re-raised without the request URL so keys cannot leak
  into logs; unexpected errors return only a request id.

## Evaluation results (real, reproducible)

Produced by `python eval/train_scam_classifier.py` on the EMSCAD CSV from the Hugging Face hub
(`victor/real-or-fake-fake-jobposting-prediction`, CC0): 17,880 postings, 866 fraudulent (4.8%). Stratified 60/20/20 split,
seed 42; all tuning (C=10, w_r=0.0, thresholds) on the validation split only. **Test split, fraud class positive:**

| Variant | Precision | Recall | F1 | AUC-ROC | AUC-PR |
| --- | --- | --- | --- | --- | --- |
| Rule-only | 0.048 | 1.000 | 0.092 | 0.496 | 0.048 |
| Classifier-only | 0.870 | 0.809 | 0.838 | 0.983 | 0.905 |
| Hybrid, plain formula | 0.870 | 0.809 | 0.838 | 0.983 | 0.905 |
| Hybrid + rule floor (deployed) | 0.870 | 0.809 | 0.838 | 0.982 | 0.900 |

Deployed bands on the test set: *safe* 3,192 postings (0.4% fraudulent), *caution* 223 (9.0%), *high* 161 (87.0%).
(Precision/recall use each variant's own validation-F1-optimal cut; "rule-only" degenerates to flagging everything.
No-skill AUC-PR is the 4.8% prevalence.)

**What this does and does not show — please read:**

* The classifier is strong **on EMSCAD**. It is not evidence about live Adzuna listings: Adzuna gives short snippets, EMSCAD
  has full postings (and was collected years ago), so expect lower real-world performance. `company_profile` was excluded
  from training for this reason, but the distribution shift remains.
* **The four rules carry essentially no signal on EMSCAD**: validation found `w_r = 0` (the hybrid collapses to the
  classifier), and any rule fires on 0.0% of fraudulent and 0.6% of legitimate validation postings (h4 never fires; EMSCAD
  appears to redact e-mail addresses). The rules target advance-fee/payment/identity scams, which EMSCAD barely contains, so
  this dataset **cannot validate them**. They stay because they are transparent and give users concrete reasons, but they are
  unevaluated heuristics, and they do produce false positives. That is why the rule floor exists: with `w_r = 0` a listing
  demanding a registration fee could otherwise be rated "low risk" by the classifier alone. The floor costs 0.001 AUC-ROC here.
* The ATS-vs-human-rating correlation and the job-ranking P@K/nDCG@K scripts are provided and unit-tested, but **no results
  are reported** because they need rating data that only you can supply.

## Testing: what was and was not run

Run in the development sandbox and passing:

| Suite | Result |
| --- | --- |
| `gateway`: typecheck (strict), eslint, vitest | 67 tests (real in-memory MongoDB; ML service mocked) |
| `web`: typecheck, eslint, vitest, production build | 23 tests |
| `ml-service`: ruff, pytest | 130 tests (includes one against the real MiniLM model) |
| `eval`: pytest | 12 tests |
| Browser end-to-end (Playwright, real MiniLM model, trained classifier) | register → profile → resume → ATS → job search (hybrid) → insights → roadmap + progress → export → account deletion; also resume builder, exports and sharing, scam radar, mobile width |

**Not run / not verified:**

* **Live Adzuna** and **live Gemini**: no keys were available. Adzuna was exercised against a local server returning
  Adzuna-shaped JSON (and `httpx` mocks); Gemini against a mocked client and with the key absent. Parsing follows the
  documented fields, but verify with your own keys.
* **Docker**: images and `docker compose up` were not built (no Docker daemon in the sandbox); `docker compose config` validates.
  Python 3.11 (the Docker version) was not used; tests ran on 3.13.
* **GitHub Actions** workflow (`.github/workflows/ci.yml`) has never run.
* DOCX output was checked for valid structure only, not opened in Word; PDF layout was viewed as a rendered image.
* HTTPS/`Secure` cookie behaviour and multi-instance rate limiting were not tested.
* `web/nginx.conf` itself was never run (nginx is not installed in the sandbox, so its syntax is unchecked). Its CSP string was
  checked by serving the production build with the identical header from a small Node harness and driving it in a browser
  (sign-up and the builder: no violations); the `/api` proxy and cache headers are untested.

## Known limitations

* No refresh tokens: sessions end after 30 minutes. No password reset or email verification flow.
* Rate limiting is in memory per gateway process.
* Adzuna descriptions are ~500-character snippets, so matching, skill extraction and scam rules only see the snippet;
  skill demand is therefore a *lower bound* and a scam signal later in the real posting can be missed.
* The skill lexicon (≈140 skills) is curated, not exhaustive; roadmap quality depends on it (`skills_lexicon.json` is editable).
* MiniLM reads only the first ~256 tokens of each text; the UI warns when a resume or job description is truncated for the score.
* ATS keywords are single words (multi-word skills appear as separate words); the score is similarity, not a hiring prediction.
* Market data is a sample of at most ~100 listings per query; salary statistics use range midpoints and many Adzuna salaries
  are estimates (the share is shown).
* The classifier loader unpickles `scam_clf.joblib`: only use a model file you trained.
* Preview and PDF/DOCX are separate renderers: close, not pixel-identical.

## Honesty notes

* No fake scores, listings or insights exist in production code paths. The seed script (`npm run seed`) creates one account
  and one resume, both labelled **DEMO DATA**, and nothing else; it refuses to run with `NODE_ENV=production`.
* The "layout preview" thumbnails on the New Resume page use obvious placeholder text ("Your Name") and say so.
* Any stand-in or deviation from the specification is documented above (short-term allow-list and boilerplate list in keyword
  extraction, the rule floor, single-word keywords).
