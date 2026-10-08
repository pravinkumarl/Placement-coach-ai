# Placement Coach AI

A placement preparation platform for engineering students: aptitude/verbal/logical assessments, coding and DBMS practice, mock interviews, a personalised preparation roadmap, performance analytics, and an AI coach — now backed by a real **Node.js + Express + MongoDB** API instead of browser-only storage.

> Full endpoint reference: [`docs/API.md`](docs/API.md)

## Features

- **Accounts & auth** — register / sign in with bcrypt password hashing and JWT bearer tokens (7-day expiry).
- **Assessments** — 8 modules (quant, logical, verbal, coding, dbms, technical, hr, communication) with mcq, code, sql, interview and communication question types. **Grading happens on the server**; answer keys are stripped from every API response.
- **Performance analytics** — per-topic accuracy, attempt history, strengths/weak areas, rule-based coaching insights, and a readiness score (`0.7 × average attempt % + 0.3 × roadmap completion %`).
- **Roadmap** — an 8-milestone starter plan is created at registration; regenerate with AI (Gemini) when configured, otherwise a deterministic fallback plan is used. Progress updates recalculate completion and readiness.
- **Mock interviews** — HR / technical / managerial / mock sessions with per-answer scoring and feedback plus an overall score on completion.
- **AI coach chat** — persistent conversations; Gemini is called **only from the backend** (`GEMINI_API_KEY` never reaches the browser).
- **Dashboard** — one aggregate endpoint powering KPIs, trend, next milestone, weak/strong topics.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Static HTML/CSS/vanilla JS (Bootstrap 5, Chart.js, marked) — original UI preserved |
| API | Node.js 18+, Express 5, ES modules |
| Database | MongoDB via Mongoose |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| Security | helmet, CORS allow-list, express-rate-limit, strict input validation |
| AI | Google Gemini (server-side only, optional) |
| Tests | `node:test` + supertest |
| Hosting | Any Node host, or Vercel (static + `api/index.js` serverless function) |

## Project structure

```
├── api/
│   └── index.js          # Vercel entry — re-exports the Express app
├── backend/
│   ├── scripts/seed.js   # Seed question bank (+ --demo user, --reset)
│   ├── src/
│   │   ├── config/       # env + lazy Mongo connection
│   │   ├── controllers/  # route handlers
│   │   ├── data/         # assessment question bank
│   │   ├── middleware/   # auth, validation, error handling
│   │   ├── models/       # User, Assessment, AssessmentAttempt, TopicPerformance,
│   │   │                 # Roadmap, InterviewSession, ChatSession
│   │   ├── routes/       # /api/* routers
│   │   ├── services/     # gemini, grading, performance, roadmap, chat, interview
│   │   ├── utils/        # jwt, password, response envelope
│   │   ├── app.js        # Express app (shared by server.js and Vercel)
│   │   └── server.js     # local entry point
│   └── tests/            # node:test + supertest suites
├── js/
│   ├── api.js            # window.API — fetch client + token/session storage
│   └── auth-guard.js     # redirects signed-out users, syncs the sidebar
├── docs/API.md           # API reference
└── *.html                # the original pages, now bound to the API
```

## Getting started (local)

**Prerequisites:** Node.js ≥ 18.17, npm, MongoDB ≥ 6 running locally (or an Atlas URI).

```bash
# 1. install
npm install

# 2. configure
copy .env.example .env       # Windows: copy, macOS/Linux: cp
#    then fill in MONGODB_URI and a long random JWT_SECRET
#    GEMINI_API_KEY is optional — AI endpoints return 503 without it

# 3. seed the question bank
npm run seed                 # add --demo for a demo login, --reset to wipe first

# 4. run (serves API + static pages on http://localhost:5000)
npm start                    # or: npm run dev  (auto restart on change)
```

Open <http://localhost:5000> — clean URLs work (`/dashboard`, `/profile`, `/roadmap`, …).

Demo account (only with `npm run seed -- --demo`): `demo@placementcoach.ai` / `Demo@12345`.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | yes | Mongo connection string |
| `JWT_SECRET` | yes | Signs access tokens — use a long random string |
| `GEMINI_API_KEY` | no | Enables chat/roadmap AI; server-side only |
| `GEMINI_MODEL` | no | Overrides the default model fallback chain |
| `JWT_EXPIRES_IN` | no | Token lifetime, default `7d` |
| `PORT` | no | HTTP port, default `5000` |
| `CLIENT_URL` | no | Allowed CORS origin |
| `NODE_ENV` | no | `development` \| `production` \| `test` |

`.env` is git-ignored. Never commit secrets or paste the Gemini key into the browser.

## Tests

```bash
npm test
```

103 tests across health/auth/assessments/roadmap/chat/profile/dashboard/interview/authorization suites (including the spec alias endpoints, persisted chat sessions, interview sub-scores, cross-user isolation and attempt-integrity checks), run with `node:test` + supertest against a throwaway `placement_coach_test_<suite>` database (dropped after each run). No AI key is required — AI routes are asserted to fail cleanly with `503`.

## Deploying to Vercel

1. Push the repository and import it into Vercel (framework preset: **Other**).
2. Set project environment variables: `MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY` (optional), `NODE_ENV=production`.
3. Deploy. `vercel.json` rewrites `/api/(.*)` to the serverless function in `api/index.js`; every other path is served as a static file, so the pages and `js/` assets work unchanged.
4. Seed the database once from your machine against the same `MONGODB_URI` (`npm run seed`).

## Notes & limitations

- The question bank currently holds **26 questions across 8 modules** (extracted from the original static pages) — extend `backend/src/data/assessmentBank.js` and re-run `npm run seed`.
- `code` and `sql` answers are graded as "submitted vs empty"; there is no offline code judge, so a full sandboxed judge would be the next upgrade.
- `GEMINI_API_KEY` is optional everywhere: chat, interviews and roadmap generation degrade gracefully (503 with a clear message, or a deterministic roadmap fallback).
- Rate limits: auth 30/15 min, AI 20/min, general API 600/15 min per IP.
