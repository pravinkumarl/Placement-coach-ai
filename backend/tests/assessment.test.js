import { test, before, after, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getApp, startTestDb, stopTestDb, resetDb, registerUser } from './setup.js';

let app;
let token;

before(async () => {
  await startTestDb();
  app = await getApp();
  await resetDb({ seedAssessments: true });
});

after(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  const session = await registerUser(request(app));
  token = session.token;
});

const auth = (r) => r.set('Authorization', `Bearer ${token}`);
const jsonHas = (obj, needle) => JSON.stringify(obj).includes(needle);

describe('GET /api/assessments', () => {
  test('lists the seeded modules', async () => {
    const res = await auth(request(app).get('/api/assessments'));

    assert.equal(res.status, 200);
    const assessments = res.body.data.assessments;
    assert.ok(Array.isArray(assessments) && assessments.length >= 5, 'expected seeded modules');

    const keys = assessments.map((a) => a.moduleKey);
    assert.ok(keys.includes('quant'));
    assert.ok(keys.includes('coding'));
    assert.ok(assessments.every((a) => typeof a.questionCount === 'number'));
    assert.ok('lastScore' in assessments[0], 'lastScore present (null for new user)');
  });

  test('never leaks answer keys', async () => {
    const res = await auth(request(app).get('/api/assessments'));
    assert.ok(!jsonHas(res.body, 'correctKey'), 'correctKey must be stripped');
    assert.ok(!jsonHas(res.body, 'correctAnswer'), 'correctAnswer must be stripped');
  });
});

describe('GET /api/assessments/:id', () => {
  test('returns one module with questions but no answers', async () => {
    const res = await auth(request(app).get('/api/assessments/quant'));

    assert.equal(res.status, 200);
    const assessment = res.body.data.assessment;
    assert.equal(assessment.moduleKey, 'quant');
    assert.ok(assessment.questions.length > 0);
    assert.ok(!('correctKey' in assessment.questions[0]));
    assert.ok(assessment.questions[0].id, 'questions carry a stable id');
  });

  test('404s for an unknown module', async () => {
    const res = await auth(request(app).get('/api/assessments/nope'));
    assert.equal(res.status, 404);
  });
});

describe('attempt lifecycle', () => {
  test('start returns a stripped question set and an attempt id', async () => {
    const res = await auth(request(app).post('/api/assessments/quant/start')).send({});

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.data.attemptId);
    const questions = res.body.data.assessment.questions;
    assert.ok(questions.length > 0);
    assert.ok(!jsonHas(questions, 'correctKey'), 'answers stripped at start');
    assert.ok(res.body.data.assessment.title);
  });

  test('submit is graded server side and recorded', async () => {
    const start = await auth(request(app).post('/api/assessments/quant/start')).send({});
    const { attemptId } = start.body.data;
    const questions = start.body.data.assessment.questions;

    const answers = questions.map((q) => ({
      questionId: q.id,
      value: q.type === 'mcq' ? q.options[0].key : 'a reasonable answer',
    }));

    const submit = await auth(request(app).post('/api/assessments/quant/submit')).send({
      attemptId,
      answers,
      timeTakenSeconds: 120,
    });

    assert.equal(submit.status, 200, JSON.stringify(submit.body));
    const attempt = submit.body.data.attempt;
    assert.ok(Number.isFinite(attempt.percentage));
    assert.ok(attempt.percentage >= 0 && attempt.percentage <= 100);
    assert.equal(attempt.questionCount, questions.length);
    assert.ok(Array.isArray(attempt.topicResults));
    assert.ok(attempt.topicResults.every((t) => Number.isFinite(t.percentage)));
    assert.equal(submit.body.data.readinessScore, req2num(submit.body.data.readinessScore));

    const history = await auth(request(app).get('/api/assessments/attempts'));
    assert.equal(history.status, 200);
    assert.ok(history.body.data.attempts.length >= 1);

    const stats = await auth(request(app).get('/api/assessments/stats'));
    assert.equal(stats.status, 200);
    assert.equal(stats.body.data.totalAssessments, 1);
    assert.ok(stats.body.data.byCategory.length >= 1);
  });

  test('every mcq answered with the stored key scores correct', async () => {
    const { default: Assessment } = await import('../src/models/Assessment.js');
    const stored = await Assessment.findOne({ moduleKey: 'quant' }).lean();
    const correctById = new Map(
      (stored.questions || []).map((q) => [String(q.id), q.correctKey])
    );

    const start = await auth(request(app).post('/api/assessments/quant/start')).send({});
    const { attemptId } = start.body.data;
    const questions = start.body.data.assessment.questions;

    const answers = questions.map((q) => ({
      questionId: q.id,
      value: correctById.has(String(q.id))
        ? correctById.get(String(q.id))
        : 'non empty answer',
    }));

    const submit = await auth(request(app).post('/api/assessments/quant/submit')).send({
      attemptId,
      answers,
      timeTakenSeconds: 45,
    });

    assert.equal(submit.status, 200, JSON.stringify(submit.body));
    const attempt = submit.body.data.attempt;
    assert.equal(attempt.percentage, 100, 'all answers correct → 100%');
    assert.equal(attempt.score, attempt.questionCount);
  });

  test('empty and wrong answers score zero', async () => {
    const start = await auth(request(app).post('/api/assessments/quant/start')).send({});
    const { attemptId } = start.body.data;

    const submit = await auth(request(app).post('/api/assessments/quant/submit')).send({
      attemptId,
      answers: [],
      timeTakenSeconds: 10,
    });

    assert.equal(submit.status, 200);
    assert.equal(submit.body.data.attempt.percentage, 0);
    assert.equal(submit.body.data.attempt.score, 0);
  });

  test('answers must be an array', async () => {
    const res = await auth(request(app).post('/api/assessments/quant/submit')).send({
      answers: 'not an array',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('start for an unknown module returns 404', async () => {
    const res = await auth(request(app).post('/api/assessments/nope/start')).send({});
    assert.equal(res.status, 404);
  });

  test('anonymous access is rejected', async () => {
    const res = await request(app).post('/api/assessments/quant/start').send({});
    assert.equal(res.status, 401);
  });
});

function req2num(value) {
  assert.ok(typeof value === 'number', 'readinessScore must be a number');
  assert.ok(value >= 0 && value <= 100, 'readinessScore in 0..100');
  return value;
}
