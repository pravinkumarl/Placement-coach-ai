# Readiness Score — Calculation & Behavior

The readiness score is the single number that answers *"how ready is this candidate for placements?"*.
It is computed **server-side** and stored on the user document as `readinessScore` (0–100). It is **never
hardcoded or guessed on a page**; every dashboard/progress value is derived from real assessment and
roadmap data.

## Formula

```
readiness = round(0.7 × avgAssessmentScore + 0.3 × roadmapCompletionPercentage)
```

Where:

| Component | Source | Definition |
|---|---|---|
| `avgAssessmentScore` | `AssessmentAttempt` | Average `percentage` across all rows with `status: 'completed'` for the user. `0` if none exist. |
| `roadmapCompletionPercentage` | `Roadmap` | `completionPercentage` field on the user's roadmap. `0` if no roadmap exists. |

`Math.round` is applied so the stored score is always an integer in `0..100`.

## Implementation

`backend/src/services/performance.service.js` → `recalculateReadiness(userId)`

```
const [attemptAgg, roadmap] = await Promise.all([
  AssessmentAttempt.aggregate([
    { $match: { userId, status: 'completed' } },
    { $group: { _id: null, avg: { $avg: '$percentage' } } },
  ]),
  Roadmap.findOne({ userId }).select('completionPercentage').lean(),
]);
const assessmentScore = attemptAgg[0]?.avg ?? 0;
const roadmapScore = roadmap?.completionPercentage ?? 0;
const readiness = Math.round(assessmentScore * 0.7 + roadmapScore * 0.3);
```

## When is it recomputed?

`recalculateReadiness` is called automatically whenever a score-affecting event happens:

| Event | Where |
|---|---|
| Assessment attempt graded & marked complete | `assessment.service.js` → `finalizeAssessmentAttempt` |
| Roadmap milestone completes automatically | `roadmap.service.js` → `completeRoadmapMilestone` |
| Milestone manually marked complete (`PATCH /api/roadmap/milestones/:id`) | `roadmap.controller.js` |
| Coding submission scores 100 (auto-completes its milestone) | `roadmap.service.js` |

Because the recalculation runs in these write paths, the stored `readinessScore` is always current
for reads (dashboard, chat, roadmap generation).

## Exposed via API

- `GET /api/dashboard` → `data.readinessScore` (stored 0–100) and `data.readinessBreakdown`:
  `{ readinessScore, assessmentScore, codingScore, roadmapProgress, interviewScore }`,
  plus `data.stats.roadmapCompletion`.
- `GET /api/performance/summary` also carries the readiness score so the progress page renders
  real values.

## Readiness breakdown (dashboard gauge)

The dashboard gauge renders from `data.readinessScore` (the stored, freshly-recalculated value) via
`renderGauge(data.readinessScore || 0)` in `dashboard.html` — it sets the gauge element's `data-score`
attribute and animates the SVG fill and `gauge-score` text (`data-suffix="%"`, no `data-countup`, so no
fake aim animations). `readinessBreakdown.assessmentScore` is the simple average of completed attempt
percentages; the blended stored score also folds in the roadmap/coding/interview components per the
`0.7/0.3` rule above.

## Test coverage

`backend/tests/readiness.test.js`

- assesses formula: `round(0.7 × avg + 0.3 × roadmap)` incl. no-attempts → fault roadmap-only and
  assessment-only cases;
- verifies breakdown numbers match the stored score;
- verifies a coding block submission still recomputes readiness;
- verifies the endpoint returns real (not seeded) values.