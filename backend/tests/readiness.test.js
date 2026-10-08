import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { getApp, startTestDb, stopTestDb, resetDb, registerUser } from './setup.js';
import { recalculateReadiness } from '../src/services/performance.service.js';

let app;
let token;

before(async () => {
  await startTestDb();
  app = await getApp();
  await resetDb({ seedAssessments: true });
  const session = await registerUser(request(app));
  token = session.token;
});

after(async () => {
  await stopTestDb();
});

const auth = (r) => r.set('Authorization', `Bearer ${token}`);

async function completeAttempt(moduleKey = 'quant') {
  const start = await auth(request(app).post(`/api/assessments/${moduleKey}/start`)).send({});
  const { attemptId, assessment } = start.body.data;
  const answers = assessment.questions.map((q) => ({
    questionId: q.id,
    value: q.type === 'mcq' ? q.options[0].key : 'a reasonable answer',
  }));
  const submit = await auth(request(app).post(`/api/assessments/${moduleKey}/submit`)).send({
    attemptId,
    answers,
    timeTakenSeconds: 60,
  });
  return submit.body.data;
}

describe('readiness calculation (documented formula)', () => {
  test('matches round(0.7 * avg attempt% + 0.3 * roadmap%)', async () => {
    const userId = (await auth(request(app).get('/api/users/me'))).body.data.user._id;

    // Fresh user, no attempts, 0% roadmap -> 0
    const zero = await recalculateReadiness(new mongoose.Types.ObjectId(String(userId)));
    assert.equal(zero, 0);

    // Complete quant -> roadmap quant milestone auto-completes.
    await completeAttempt('quant');

    const roadmap = await auth(request(app).get('/api/roadmap'));
    const roadmapPct = roadmap.body.data.roadmap.completionPercentage;
    assert.ok(roadmapPct > 0, 'quant milestone auto-completes on assessment submission');

    const perf = await auth(request(app).get('/api/performance'));
    const avg = perf.body.data.summary.averageScore;

    const dashboard = await auth(request(app).get('/api/dashboard'));
    const ready = await recalculateReadiness(new mongoose.Types.ObjectId(String(userId)));
    const expected = Math.round(avg * 0.7 + roadmapPct * 0.3);

    assert.equal(ready, expected);
    assert.equal(ready, dashboard.body.data.readinessScore);
    assert.ok(ready >= 0 && ready <= 100);
  });

  test('readinessBreakdown is exposed and self-consistent', async () => {
    const dash = await auth(request(app).get('/api/dashboard'));
    assert.equal(dash.status, 200, JSON.stringify(dash.body));

    const breakdown = dash.body.data.readinessBreakdown;
    assert.ok(breakdown, 'readinessBreakdown present');
    assert.equal(typeof breakdown.readinessScore, 'number');
    assert.equal(typeof breakdown.assessmentScore, 'number');
    assert.equal(typeof breakdown.codingScore, 'number');
    assert.equal(typeof breakdown.roadmapProgress, 'number');
    assert.equal(breakdown.readinessScore, dash.body.data.readinessScore);
  });

  test('performance exposes the same breakdown plus a coding block', async () => {
    const res = await auth(request(app).get('/api/performance'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.readinessBreakdown);
    assert.ok(res.body.data.coding, 'coding block present');
    assert.equal(typeof res.body.data.coding.totalSubmissions, 'number');
    assert.equal(typeof res.body.data.coding.averageScore, 'number');
  });

  test('coding submissions appear in the performance coding block', async () => {
    const CodingSubmission = (await import('../src/models/CodingSubmission.js')).default;
    const user = (await auth(request(app).get('/api/users/me'))).body.data.user;

    await CodingSubmission.create({
      userId: new mongoose.Types.ObjectId(String(user._id)),
      questionId: 'code-1',
      moduleKey: 'coding',
      language: 'python',
      sourceCode: '# test',
      status: 'Accepted',
      passedTests: 2,
      totalTests: 2,
      score: 100,
    });

    const res = await auth(request(app).get('/api/performance'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.coding.totalSubmissions >= 1);
    assert.ok(res.body.data.coding.acceptedSubmissions >= 1);
  });
});