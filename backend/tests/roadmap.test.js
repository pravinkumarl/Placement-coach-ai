import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { getApp, startTestDb, stopTestDb, resetDb, registerUser } from './setup.js';

let app;
let token;

before(async () => {
  await startTestDb();
  app = await getApp();
  await resetDb();
  const session = await registerUser(request(app));
  token = session.token;
});

after(async () => {
  await stopTestDb();
});

const auth = (r) => r.set('Authorization', `Bearer ${token}`);

describe('GET /api/roadmap', () => {
  test('returns the starter roadmap created at registration', async () => {
    const res = await auth(request(app).get('/api/roadmap'));

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const roadmap = res.body.data.roadmap;
    assert.ok(Array.isArray(roadmap.milestones));
    assert.ok(roadmap.milestones.length >= 5, 'starter milestones present');
    assert.equal(roadmap.completionPercentage, 0);
    assert.equal(roadmap.isGenerated, false);
    assert.ok(roadmap.milestones.every((m) => m.status === 'pending'));
    assert.ok(roadmap.milestones.every((m, i) => m.order === i + 1), 'ordered 1..n');
    assert.ok(roadmap.milestones.every((m) => m.title && typeof m.description === 'string'));
  });
});

describe('PATCH /api/roadmap/milestones/:id', () => {
  test('marks a milestone in progress then completed and recalculates', async () => {
    const before = await auth(request(app).get('/api/roadmap'));
    const milestone = before.body.data.roadmap.milestones[0];

    const inProgress = await auth(
      request(app).patch(`/api/roadmap/milestones/${milestone._id}`)
    ).send({ status: 'in_progress' });

    assert.equal(inProgress.status, 200, JSON.stringify(inProgress.body));
    assert.equal(inProgress.body.data.roadmap.milestones[0].status, 'in_progress');
    assert.equal(inProgress.body.data.roadmap.completionPercentage, 0);

    const completed = await auth(
      request(app).patch(`/api/roadmap/milestones/${milestone._id}`)
    ).send({ status: 'completed' });

    assert.equal(completed.status, 200);
    const roadmap = completed.body.data.roadmap;
    assert.equal(roadmap.milestones[0].status, 'completed');
    assert.ok(roadmap.milestones[0].completedAt, 'completedAt stamped');
    assert.ok(roadmap.completionPercentage > 0, 'completion recalculated');
    assert.equal(typeof completed.body.data.readinessScore, 'number');

    const again = await auth(
      request(app).patch(`/api/roadmap/milestones/${milestone._id}`)
    ).send({ status: 'pending' });
    assert.equal(again.body.data.roadmap.milestones[0].completedAt, null, 'un-completing clears it');
    assert.equal(again.body.data.roadmap.completionPercentage, 0);
  });

  test('rejects an invalid milestone id', async () => {
    const res = await auth(request(app).patch('/api/roadmap/milestones/not-an-id')).send({
      status: 'completed',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /milestone id/i);
  });

  test('404s for a well formed but unknown milestone id', async () => {
    const res = await auth(
      request(app).patch(`/api/roadmap/milestones/${new mongoose.Types.ObjectId()}`)
    ).send({ status: 'completed' });
    assert.equal(res.status, 404);
  });

  test('rejects an unknown status', async () => {
    const before = await auth(request(app).get('/api/roadmap'));
    const milestone = before.body.data.roadmap.milestones[0];

    const res = await auth(
      request(app).patch(`/api/roadmap/milestones/${milestone._id}`)
    ).send({ status: 'done' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /status/i);
  });
});

describe('POST /api/roadmap/generate', () => {
  test('falls back to the deterministic plan when AI is not configured', async () => {
    const res = await auth(request(app).post('/api/roadmap/generate')).send({});

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const roadmap = res.body.data.roadmap;
    assert.notEqual(roadmap.generatedBy, 'gemini', 'no AI key → system plan');
    assert.match(res.body.message, /default plan|AI/i);
    assert.ok(roadmap.milestones.length >= 5);
    assert.ok(roadmap.summary && roadmap.summary.length > 0);
  });
});

describe('DELETE /api/roadmap', () => {
  test('resets everything back to the neutral starter plan', async () => {
    const before = await auth(request(app).get('/api/roadmap'));
    const milestone = before.body.data.roadmap.milestones[0];
    await auth(request(app).patch(`/api/roadmap/milestones/${milestone._id}`)).send({
      status: 'completed',
    });

    const res = await auth(request(app).delete('/api/roadmap'));
    assert.equal(res.status, 200);

    const afterReset = await auth(request(app).get('/api/roadmap'));
    const roadmap = afterReset.body.data.roadmap;
    assert.equal(roadmap.completionPercentage, 0);
    assert.ok(roadmap.milestones.every((m) => m.status === 'pending'));
  });
});
