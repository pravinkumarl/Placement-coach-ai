# Backend QA Report — PR #1 (`backend-database`)

Date: 2026-10-07
Repo: `pravinkumarl/Placement-coach-ai`
Branch under test: `backend-database` (HEAD `bc59a16` at QA start, 11 commits ahead of `origin/main`)
Tester environment: Windows, Node v24.18.0, npm 11.16.0, MongoDB 8.2 (local), live backend on `http://localhost:5000`

Legend: **PASS** / **FAIL** (fixed in this PR) / **WARNING** (needs platform-side verification).

---

## 1. Build, lint, typecheck — WARNING (`NOT CONFIGURED`)

| Check | Result |
| --- | --- |
| `npm run build` | Script does not exist — plain Express + static frontend, no bundler |
| `npm run lint` | Script does not exist (no ESLint config in repo) |
| `npm run typecheck` | Script does not exist (codebase is plain ESM JavaScript) |
| Syntax gate used instead | `node --check` on every changed file — **PASS** |

## 2. Dependency install — PASS

`npm install` completes with **0 vulnerabilities**. Runtime deps: express, mongoose, cors, helmet, morgan, express-rate-limit, jsonwebtoken, dotenv, express-validator.

## 3. Git / PR state — PASS

- Branch `backend-database`, remote `origin → github.com/pravinkumarl/Placement-coach-ai.git`
- 11 commits ahead of `origin/main`, working tree clean at start
- `gh` CLI not installed → PR #1 reviewed via local branch comparison only

## 4. Environment & secrets audit — PASS

- `.env` (gitignored, verified with `git check-ignore`) contains only `MONGODB_URI`, `JWT_SECRET`, `PORT`, `CLIENT_URL`, `NODE_ENV` — no values printed
- Secret scan of all tracked files: no API keys (`AIza…`), no `mongodb+srv` URIs, no JWT secrets, no `ghp_`/`sk-` tokens, no hardcoded credentials
- Frontend: no Gemini key or Google API key anywhere; the only key-related code is `localStorage.removeItem('GEMINI_API_KEY')` cleanup
- `.env.example` is the only env template committed

## 5. Server startup & health — PASS

- `node backend/src/server.js` → `[db] connected`, listening on 5000, no errors in `server.err.log`
- `GET /api/health` → `{success:true, status:"ok", database:"connected", timestamp, data{…}}`

## 6. Database-unavailable behavior — PASS

Instance started with `MONGODB_URI=mongodb://127.0.0.1:9/…`:

- Process **exited with code 1** and logged `[server] failed to start: connect ECONNREFUSED 127.0.0.1:9`
- Port never opened → the API **cannot report a false "connected" health state**
- Mid-run drop: `ensureDatabaseConnection` answers `503 "Database is unavailable. Please try again shortly."` (covered by unit tests)

## 7. Functional QA — auth, registration, login, tokens — PASS (49 checks)

Scripted run `qa-a.mjs`: **49/49 passed** — health, registration happy/duplicate/validation paths (A–E), login, profile `PUT`/`PATCH`, email-change rejection, re-login persistence, and JWT negative cases (missing / malformed / expired / wrong signature → `401`, identity always taken from the token).

## 8. Functional QA — user isolation — PASS (after fix)

All cross-user probes return `404` and never mutate the owner's data (dashboard, attempts, performance, roadmap, interviews, chat sessions/messages). Covered live (script) **and** in the automated suite (§9).

## 9. Automated test suite — PASS (73 → 103 tests)

```text
npm test  →  tests 103  |  pass 103  |  fail 0  |  skipped 0  |  suites 9 files / 29 groups
```

New file: `backend/tests/authorization.test.js` (**30 tests**) covering everything §32 flagged as missing:
- 401 for missing + malformed tokens on 9 protected routes (18 tests)
- Assessment attempt integrity: foreign attempt `404`, duplicate submit `409`, malformed id `400`, unknown id `404`, cross-user history/stats stay empty
- Chat session isolation: read / post / delete of foreign session → `404`, owner data untouched
- Interview isolation: foreign read / answer / complete → `404`, list scoped to owner
- Roadmap isolation: foreign status-update / delete → `404`, owner milestone untouched, list scoped

Test DBs are throwaway per suite (`placement_coach_test_<suite>`, dropped after run); no AI key required.

## 10. Functional QA — dashboard, assessments, scoring, performance, roadmap, interviews, chat, AI, errors — PASS (85 checks)

Scripted run `qa-b.mjs`: **85/85 passed**, including:

- Dashboard: empty + populated payloads, no `NaN`/undefined
- Assessment: list/detail (never leaks `correctKey`), invalid module `404`, `401` without token, malformed body `400`
- **Deterministic scoring**: 4/5 correct → exactly `80%` recomputed server-side from stored keys; client-sent percentage ignored
- Performance: `/`, `/topics`, `/history`, `/insights` — numbers only, readiness formula correct
- Roadmap: full CRUD, `completedAt` set, persistence across re-login, `401` guard
- Interviews: create → answer → complete with `technicalScore` / `problemSolvingScore` / `communicationScore` / `strengths` / `weaknesses` / feedback, persisted
- Chat: session CRUD, empty/long/invalid-id `400`, user message persisted even when Gemini returns `503`, ordering, `conversationId` history growth, delete → later `404`
- Gemini: `POST /api/gemini/text`, `POST /api/chat`, `POST /api/chat/quick` all degrade to clean `503 {success:false}` with **no secrets in the body**, roadmap generate falls back to a deterministic plan
- Errors: unknown route → JSON `404`, malformed JSON → `400`, invalid ObjectId → `400`, **no stack traces in production-shaped responses**

## 11. Persistence across restart — PASS (22 checks)

Full 15-step scenario (`qa-c1` → **backend restart** → `qa-c2`): **12/12 then 10/10 passed**. Profile, the 80% attempt + stats + performance topics, completed roadmap milestone, completed interview with sub-scores, and chat messages all survive a full process restart.

## 12. Frontend integration — PASS (static) / WARNING (browser)

- All 11 pages served `200` (`/`, `/login`, `/dashboard`, `/profile`, `/performance`, `/progress`, `/roadmap`, `/assessment-hub`, `/live-assessment`, `/chat`, `/mock-simulation`)
- Script order on every protected page: `js/api.js` → `js/auth-guard.js` → `app.js`; all inline scripts parse
- **Endpoint map**: every `/api/...` path referenced by the pages/JS was probed live — **zero `404` routes** (protected ones correctly answer `401`/`400`)
- `localStorage` holds only UI/session caches (`pc_auth_token`, `pc_auth_user`, `pc-theme`, …) — database is the source of truth
- **WARNING**: no browser was available in this environment, so rendered console/network checks are **not verified** — needs one manual smoke pass in the deployed preview

## 13. Vercel deployment — WARNING (`DEPLOYMENT NOT FULLY VERIFIED`)

- `vercel.json`: `/api/(.*) → /api/index` rewrite, `/config.js → /config.example.js`, cache + `nosniff` headers — inspected and correct
- `api/index.js` imports and exports the Express app cleanly (verified with `node -e "import('./api/index.js')…"` → `type: function`)
- `NODE_ENV=production` instance verified locally: real CORS behavior exercised (see §14)
- **Not verified**: an actual Vercel preview deployment (requires platform access). Must confirm after merge/deploy: env vars set (`MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`), serverless cold start, and `CLIENT_URL` set to the deployed origin

## 14. Security audit — 3 issues found, all FIXED

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 1 | **High** | CORS reflected **any origin with `Access-Control-Allow-Credentials: true`**, also in production — a classic wildcard-with-credentials misconfiguration | `backend/src/app.js`: origin is now only accepted for the configured `CLIENT_URL` / same origin; unknown origins get **no CORS headers** in production (dev still allows local origins for `file://`) |
| 2 | **Medium** | Static server exposed repo internals: `/server.log`, `/README.md`, `/docs/API.md`, `/package.json`, `/.git/config`, `/backend/*` were reachable | `backend/src/app.js`: deny-list middleware (`.log`, `.md`, `.pid`, `package*.json`, `.git/*`, `.env*`) + existing `/backend` `/node_modules` block |
| 3 | **High** | `submitAssessment` accepted a **foreign, unknown or already-submitted `attemptId`** and silently created a new attempt | `backend/src/controllers/assessment.controller.js`: validates ObjectId (`400`), ownership (`404`), module match (`400`), re-submit (`409`) |

Verified after fixes:

- **CORS in production mode** (`NODE_ENV=production` probe on port 5099):
  - `Origin: https://evil.example` → **no `Access-Control-Allow-Origin` header**
  - `Origin: http://localhost:5500` (CLIENT_URL) → reflected + credentials
  - `Origin: http://localhost:5099` (same origin) → reflected
  - No Origin → no ACAO
- **Static exposure probes**: 11 sensitive paths all `404`, response bodies contain no secrets; frontend assets still `200`
- `helmet` on, `x-powered-by` off, `trust proxy` on, JSON body limit `1mb`, rate limits active (global 600/15min, auth 30/15min, AI 20/min), passwords stored as bcrypt-style hashes and never serialized
- Remaining (accepted) risks: `contentSecurityPolicy: false` (required by inline scripts/CDN assets) and in-memory rate limiting (per-instance; resets on serverless cold start)

## 15. Issues found & fixed summary

| # | Issue | Status |
| --- | --- | --- |
| 1 | Foreign/duplicate/unknown assessment `attemptId` accepted | **Fixed** + 30 regression tests |
| 2 | Wildcard CORS with credentials (any origin) | **Fixed** + production probe |
| 3 | Repo internals served as static files (`/server.log`, docs, manifests) | **Fixed** + 11 probes |
| — | No other functional defects found in 156 scripted checks | — |

Open items are non-blocking: browser smoke pass, Vercel preview deploy, real Gemini key call, lint/typecheck tooling.

## 16. Verdict

**READY TO MERGE WITH WARNINGS** — 0 open defects, 3 fixed bugs (2 security-relevant), 103/103 automated tests green, 156 scripted runtime checks green. The two warnings (browser smoke, Vercel preview) are platform verification steps that cannot be completed from this environment and must be done on the deployed preview.
