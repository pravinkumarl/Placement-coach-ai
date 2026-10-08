# API Reference

Base URL: `/api` (same origin as the frontend — `http://localhost:5000` locally, `https://<app>.vercel.app` in production).

## Conventions

**Success envelope**

```json
{ "success": true, "message": "Optional human message", "data": { } }
```

**Error envelope**

```json
{ "success": false, "message": "What went wrong" }
```

| Status | Meaning |
| --- | --- |
| 400 | Validation / malformed payload |
| 401 | Missing, invalid or expired JWT |
| 404 | Resource not found (API routes only) |
| 409 | Duplicate resource (e.g. email already registered) |
| 429 | Rate limit exceeded |
| 503 | AI feature requested but `GEMINI_API_KEY` is not configured |

**Authentication** — every non-public route requires:

```
Authorization: Bearer <token>
```

Tokens are issued by `POST /api/auth/register` and `POST /api/auth/login`, expire after 7 days, and are stored in the browser under `localStorage.pc_auth_token`.

**Rate limits**

| Scope | Limit |
| --- | --- |
| `/api/auth/register`, `/api/auth/login` | 30 requests / 15 min per IP |
| AI routes (`/api/gemini/*`, `/api/chat/gemini`) | 20 requests / min per IP |
| All other `/api/*` | 600 requests / 15 min per IP |

---

## Health

### `GET /api/health`

Public. No authentication.

```json
{ "success": true, "status": "ok", "database": "connected",
  "timestamp": "2026-10-07T14:02:50.119Z",
  "data": { "status": "ok", "database": "connected", "timestamp": "…" } }
```

`database` is the live mongoose state: `connected` | `connecting` | `disconnecting` | `disconnected`.

---

## Auth

### `POST /api/auth/register` — public

Body: `name` (2–120), `email` (valid, ≤200), `password` (8–128); optional `college`, `degree`, `branch`, `graduationYear` (2000–2100).

`201`

```json
{ "success": true, "message": "Account created successfully.",
  "data": { "token": "…", "user": { "id": "…", "name": "…", "email": "…", "readinessScore": 0 } } }
```

Side effect: the default 8-milestone starter roadmap is created for the new student.

### `POST /api/auth/login` — public

Body: `email`, `password`. `200` with the same payload shape as register. Wrong credentials → `401 Incorrect email or password.`

### `GET /api/auth/me`

Returns `{ data: { user } }` — the safe profile (never includes `passwordHash`).

### `POST /api/auth/logout`

Clears the server-side rate-limit state for the caller. The client also deletes the stored token.

---

## Users

### `GET /api/users/profile`

`{ data: { user } }` — full safe profile: `name, email, phone, college, degree, branch, graduationYear, avatar, bio, cgpa, targetRole, targetCompanies, skills, interests, social{github,linkedin}, readinessScore, streak…`.

Aliases: `GET /api/users/me` returns the same payload.

### `PATCH /api/users/profile`

Partial update of: `name, phone, college, degree, branch, graduationYear, avatar (≤500 chars), bio, cgpa (0–10), targetRole, targetCompanies, skills, interests, social{github,linkedin}`.

`PUT /api/users/profile` accepts the same body (without schema validation).

Aliases with an identical contract: `PUT /api/users/me`, `PATCH /api/users/me`.

Email is **not** editable: sending a different `email` returns `400 Email cannot be changed here.`

### `PATCH /api/users/password`

Body: `currentPassword`, `newPassword` (≥8).

- `200 Password updated successfully.`
- `400` — missing fields, short new password, or `Your current password is incorrect.`

Alias: `PATCH /api/users/me/password`.

---

## Dashboard

### `GET /api/dashboard`

One aggregate call that powers the dashboard page.

```json
{ "data": {
  "readinessScore": 42,
  "stats": { "completedAssessments": 3, "averageScore": 61, "roadmapCompletion": 13,
             "assessmentsLast30Days": 3, "chatMessages": 5, "interviewsCompleted": 1,
             "studyStreak": 2 },
  "recentAttempts": [ { "title": "…", "moduleKey": "quant", "percentage": 70, "completedAt": "…" } ],
  "weakTopics": [ { "topic": "…", "score": 55 } ],
  "strongTopics": [ { "topic": "…", "score": 88 } ],
  "roadmap": { "summary": "…", "completionPercentage": 13, "nextMilestone": { }, "totalMilestones": 8 },
  "trend": [ { "date": "2026-10-07", "score": 70, "title": "…" } ]
} }
```

---

## Assessments

Question banks are stored in MongoDB and **answer keys are stripped from every response** (`correctKey`, `correctAnswer`, `expectedAnswer`, `solution`, and single-letter `answer` fields).

### `GET /api/assessments`

Published modules: `moduleKey, title, category, difficulty, durationMinutes, questionCount` plus `lastScore` and `lastAttemptAt` for the signed-in student (`null` before the first attempt).

### `GET /api/assessments/:id`

`:id` is a module key (`quant`, `coding`, …) or a Mongo id. Returns `{ data: { assessment } }` with stripped `questions`. Unknown module → `404`.

### `POST /api/assessments/:id/start`

Creates an `in_progress` attempt.

```json
{ "message": "Assessment started.", "data": {
  "attemptId": "…",
  "assessment": { "moduleKey": "quant", "title": "…", "durationMinutes": 45,
                  "questions": [ { "id": "quant-1", "type": "mcq", "question": "…",
                                   "options": [ { "key": "a", "text": "…" } ] } ] } } }
```

### `POST /api/assessments/:id/submit`

Grading is **server side only**. Body: `attemptId`, `answers: [{ questionId, value }]`, `timeTakenSeconds`.

Grading rules (`backend/src/services/grading.service.js`):

- `mcq` — case-insensitive match against the stored `correctKey`
- `code`, `sql`, `interview`, `communication` — correct when the answer is non-empty (no offline code judge)
- `percentage = round(correct / total * 100)`

```json
{ "message": "Assessment submitted and graded.", "data": {
  "attempt": { "attemptId": "…", "title": "…", "percentage": 75, "score": 3,
               "questionCount": 4, "topicResults": [ { "topic": "…", "correct": 2, "total": 2,
                                                       "percentage": 100 } ],
               "completedAt": "…", "timeTakenSeconds": 120 },
  "readinessScore": 37 } }
```

Side effects: topic performance rows are upserted and the user's `readinessScore` is recalculated (`0.7 × average attempt % + 0.3 × roadmap completion %`).

### `GET /api/assessments/attempts`

Newest first, `?limit=` (1–200, default 50).

Alias: `GET /api/assessments/history` (identical payload).

### `GET /api/assessments/:id/results`

Graded attempts for one module (up to 50, newest first) plus a summary:

```json
{ "data": { "assessment": { "_id": "…", "moduleKey": "quant", "title": "…", "category": "…" },
            "attempts": [ … ], "results": [ … ],
            "summary": { "totalAttempts": 2, "averageScore": 78, "bestScore": 95 } } }
```

`attempts` and `results` are the same array. Unknown module → `404`.

### `GET /api/assessments/stats`

`{ totalAssessments, averageScore, bestScore, totalTimeSeconds, byCategory: [{category, average, count}], timeline: [{title, percentage, completedAt, category}] }`

---

## Performance

### `GET /api/performance`

```json
{ "data": {
  "summary": { "totalAttempts": 3, "averageScore": 62, "bestScore": 80,
               "readinessScore": 41, "strongCount": 2, "weakCount": 3 },
  "topics": [ { "topic": "…", "category": "…", "attempts": 1, "averageScore": 55,
                "correct": 3, "total": 5, "lastAttemptAt": "…",
                "strength": "needs_work" } ],
  "attempts": [ { "_id": "…", "title": "…", "moduleKey": "quant", "percentage": 80,
                  "score": 4, "questionCount": 5, "topicResults": [],
                  "timeTakenSeconds": 300, "completedAt": "…" } ] } }
```

`strength` is `strong` at ≥ 70 %, otherwise `needs_work`.

Aliases:

- `GET /api/performance/topics` → `{ data: { topics, summary } }` — the same strength/weakness list.
- `GET /api/performance/history` → `{ data: { attempts, trend: [{ date, score, title }] } }`, oldest first in `trend`.

### `GET /api/performance/insights`

Rule-based coaching tips (no AI required): `{ data: { insights: [{ type, title, detail }] } }`
with types `weak_area`, `recent_result`, `getting_started`.

---

## Roadmap

### `GET /api/roadmap`

`{ data: { roadmap } }` — `summary, focusAreas, milestones[{_id, title, description, category, order, status, estimatedHours, completedAt}], completionPercentage, isGenerated, generatedBy`.

A roadmap is created automatically at registration (`generatedBy: "system"`).

### `POST /api/roadmap`

Add a custom milestone. Body: `title` (required, ≤160), optional `description` (≤600), `category`, `estimatedHours`.

`201` → `{ message: "Milestone added.", data: { roadmap, readinessScore } }`.

### `PUT /api/roadmap/:milestoneId`

Update descriptive fields only: `title`, `description`, `category`, `estimatedHours` (any subset). → `{ data: { roadmap, readinessScore } }`.

### `PATCH /api/roadmap/:milestoneId/status`

Alias of the milestone status update below: body `status` (`pending` | `in_progress` | `completed`) → `{ data: { roadmap, readinessScore } }`.

### `DELETE /api/roadmap/:milestoneId`

Removes one milestone, renumbers the rest, recalculates everything. Unknown id → `404`.

### `PATCH /api/roadmap/milestones/:milestoneId`

Body: `status` (`pending` | `in_progress` | `completed`), and/or `title`, `description`, `estimatedHours`.

Marks `completedAt`, recalculates `completionPercentage`, recalculates readiness.
Invalid id → `400`, unknown milestone → `404`, unknown status → `400`.

### `PATCH /api/roadmap/milestones/:milestoneId/reorder`

Body: `order` (1 … milestone count).

### `POST /api/roadmap/generate`

Regenerates the plan. With `GEMINI_API_KEY` configured it asks Gemini for a personalised JSON plan (`generatedBy: "gemini"`, message `Roadmap regenerated with AI.`). Without it — or when the AI call fails — it falls back to the deterministic plan (`generatedBy: "system"`, message `Roadmap regenerated with the default plan (AI unavailable).`).

### `DELETE /api/roadmap`

Resets to the neutral starter plan (`Roadmap reset.`).

---

## Mock interviews

### `POST /api/interviews`

Body: `type` (`hr` | `technical` | `managerial` | `mock`), optional `difficulty` (`Easy` | `Medium` | `Hard`), `role`, `company`, `questionCount` (3–10).

`201` → `{ data: { session } }` with `status: "in_progress"`.
Question bank and scoring are deterministic; when AI is configured the answer feedback can use Gemini.

### `GET /api/interviews`

`{ data: { sessions: […] } }` — the signed-in student's sessions, newest first.

### `GET /api/interviews/:id`

Full session incl. `questions`, `answers`, `transcript`.

### `POST /api/interviews/:id/answers`

Body: `questionId`, `answer`.

```json
{ "data": { "score": 72, "feedback": "…", "answeredCount": 2, "totalQuestions": 5,
            "nextQuestion": { "id": "…", "question": "…", "category": "…", "difficulty": "…" } } }
```

`400` if the session is already completed or `questionId` does not belong to it.

### `POST /api/interviews/:id/complete`

Computes `overallScore` (mean of answer scores) and `overallFeedback`, sets `status: "completed"`.

Also computed at completion:

- `technicalScore`, `problemSolvingScore`, `communicationScore` — mean of the answers whose question category belongs to that group (`technical`: dsa/dbms/networking/design/project/problem-solving · `problem-solving`: problem-solving/design/prioritisation/planning/initiative/ownership · `communication`: intro/motivation/self-awareness/goals/teamwork/conflict/growth/pitch/closing). A group with no answers falls back to `overallScore`.
- `strengths` / `weaknesses` — question ids scored ≥ 70 and < 45.

### `DELETE /api/interviews/:id`

---

## Chat

### `POST /api/chat`

Body: `messages: [{role, content}]` or `message`, plus optional `conversationId`.

→ `{ data: { reply } }`. With a `conversationId` the user message and the assistant reply are persisted to that conversation and the id is echoed back as `data.conversationId`.

### `POST /api/chat/quick`

Body: `message` (required), optional `history`.

### `POST /api/chat/messages`

Body: `content` (required, ≤8000), optional `conversationId` (uses the most recent conversation when omitted). Persists the user message in a conversation, calls the model, stores the assistant reply.

→ `{ data: { reply, conversationId, session: { _id, title, messageCount, lastMessageAt, messages: [...] } } }`

Without `GEMINI_API_KEY` the user message is still stored and the request fails with `503`.

### `POST /api/chat/sessions`

Body: optional `title`. `201` → `{ data: { session } }` (an empty conversation).

### `GET /api/chat/sessions`

Conversation list (max 30, newest first): `{ data: { sessions: [{ _id, title, messageCount, lastMessageAt, createdAt }] } }`.

### `GET /api/chat/sessions/:id` · `GET /api/chat/sessions/:id/messages`

Full conversation with `messages: [{ role, content, at }]` (oldest first, capped at 100) or just the message list. Sessions are scoped to their owner — another user's id returns `404`.

### `POST /api/chat/sessions/:id/messages`

Body: `content` (required). Stores the user message, asks the model, stores the reply.

→ `{ message: "Message sent.", data: { reply, message: { role: "assistant", content, at }, session } }`

Without `GEMINI_API_KEY` the user message is still stored and the request fails with `503`.

### `DELETE /api/chat/sessions/:id`

Deletes the conversation and its messages.

### `POST /api/chat/gemini`

Adapter used by the browser `GeminiService`:

```json
{ "contents": [ { "role": "user", "parts": [ { "text": "…" } ] } ],
  "systemPrompt": "optional system instruction" }
```

→ `{ data: { text } }`. Empty `contents` → `400`; no AI key → `503`.

---

## Gemini (legacy proxy)

Both routes are protected and rate limited (20/min).

### `POST /api/gemini`

Passes a raw `generateContent`-style payload straight through to Gemini. Prefer `/api/chat/gemini`.

### `POST /api/gemini/text`

Body: `prompt` (required), optional `systemInstruction` → `{ data: { text } }`.

Models are tried in order: `GEMINI_MODEL` (if set) → `gemini-3.6-flash` → `gemini-3.8-flash` → `gemini-2.0-flash`.

---

---

## Admin & TPO Portal (`/api/admin/*`)

All `/api/admin/*` endpoints require authentication **and** `role: "admin"`. Non-admin callers receive HTTP 403 Forbidden.

### `GET /api/admin/overview`
Cohort summary KPIs (total students, average readiness, attempts, placement ready count, active drives), readiness distribution, branch analytics, and recent attempt stream.

### `GET /api/admin/students`
Paginated, searchable student directory.
Query params: `page`, `limit`, `search`, `branch`, `batch`, `minCgpa`, `minReadiness`, `placementStatus`, `sortBy`, `sortOrder`.

### `GET /api/admin/students/:id`
Drill-down profile for an individual student: overall readiness, category breakdown (Aptitude, Coding, Technical, Communication, Interview), strong/weak topics, attempts history, and drive applications.

### `PATCH /api/admin/students/:id/status`
Update placement status (`unplaced` | `placed` | `opted_out`), backlogs, or CGPA.

### `GET /api/admin/analytics`
Cohort-wide topic weakness analysis, struggling student percentages, category comparisons, and Gemini-powered placement recommendations.

### `GET /api/admin/eligibility`
Screen candidates meeting drive criteria (`minCgpa`, `minReadiness`, `branches`, `maxBacklogs`, `search`).

### `GET /api/admin/eligibility/export`
Exports matching students as a downloadable CSV.

### `GET /api/admin/students/export`
Exports student directory as CSV.

### `POST /api/admin/students/import`
Bulk imports/updates students from CSV text with email validation.

### `GET/POST /api/admin/assessments`
List all assessment modules or create new modules.

### `PATCH /api/admin/assessments/:id/publish`
Toggle publication status of an assessment module.

### `GET/POST/DELETE /api/admin/questions`
Question bank repository operations (MCQ, Coding, SQL, Interview).

### `GET/POST/PUT/DELETE /api/admin/drives`
Campus recruitment drive management.

### `GET /api/admin/applications` & `PATCH /api/admin/applications/:id/status`
Recruitment stage tracking (`Applied`, `Shortlisted`, `Assessment`, `Interview`, `Selected`, `Rejected`).

### `GET/POST/DELETE /api/admin/notifications`
Institutional campus announcement broadcaster.

### `GET /api/admin/logs`
Administrative audit trail.

---

## Placement Drives (`/api/drives`)

Protected. Student-facing campus placement drive access.

### `GET /api/drives`
Lists open recruitment drives, candidate eligibility status, and active application statuses.

### `POST /api/drives/:id/apply`
Candidate submits application for an open recruitment drive.

### `GET /api/drives/my-applications`
Candidate's submitted drive applications and round statuses.

---

## Notifications (`/api/notifications`)

Protected.

### `GET /api/notifications`
Lists institutional announcements and drive alerts relevant to the candidate.

---

## Static frontend

The Express app also serves the static pages with clean URLs:

- `/` → `index.html`, `/dashboard` → `dashboard.html`, `/admin` → `admin.html`, `/login`, `/profile`, `/roadmap`, `/chat`, …
- Requests under `/backend` or `/node_modules` → `404`
- Unknown API paths → JSON `404`; unknown pages → `index.html` fallback where applicable

On Vercel, `api/index.js` exports the same app and `vercel.json` rewrites `/api/(.*)` to it; all other paths are served as static files.

