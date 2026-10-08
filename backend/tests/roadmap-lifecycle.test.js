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
  await resetDb({ seedAssessments: true });
  const session = await registerUser(request(app));
  token = session.token;
});

after(async () => {
  await stopTestDb();
});

const auth = (r) => r.set('Authorization', `Bearer ${token}`);

async function getRoadmap() {
  const res = await auth(request(app).get('/api/roadmap'));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data.roadmap;
}

async function startMilestone(milestoneId) {
  return auth(request(app).patch(`/api/roadmap/milestones/${milestoneId}/start`)).send({});
}

async function completeQuantAssessment() {
  const start = await auth(request(app).post('/api/assessments/quant/start')).send({});
  const { attemptId, assessment } = start.body.data;
  const answers = assessment.questions.map((q) => ({
    questionId: q.id,
    value: q.type === 'mcq' ? q.options[0].key : 'a reasonable answer',
  }));
  return auth(request(app).post('/api/assessments/quant/submit')).send({
    attemptId,
    answers,
    timeTakenSeconds: 60,
  });
}

describe('roadmap milestone lifecycle', () => {
  test('start moves a pending milestone to in_progress with completedAt null', async () => {
    const roadmap = await getRoadmap();
    const milestone = roadmap.milestones[0];
    assert.equal(milestone.status, 'pending');

    const res = await startMilestone(milestone._id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const started = res.body.data.roadmap.milestones[0];
    assert.equal(started.status, 'in_progress');
    assert.equal(started.completedAt, null, 'completedAt stays null when starting');
    assert.ok(started.startedAt, 'startedAt stamped when milestone starts');
    assert.equal(res.body.data.roadmap.completionPercentage, 0);
    assert.ok(res.body.data.milestone);
    assert.ok(res.body.data.activity, 'activity link returned');
    assert.match(res.body.data.activity.url, /live-assessment\.html\?module=/);
  });

  test('start is persisted across reads', async () => {
    const roadmap = await getRoadmap();
    const milestone = roadmap.milestones.find((m) => m.status === 'in_progress');
    assert.ok(milestone, 'a milestone is in_progress');

    const fresh = await getRoadmap();
    const again = fresh.milestones.find((m) => m._id === milestone._id);
    assert.equal(again.status, 'in_progress');
  });

  test('starting again on the same milestone keeps it in_progress', async () => {
    const roadmap = await getRoadmap();
    const milestone = roadmap.milestones.find((m) => m.status === 'in_progress');
    const res = await startMilestone(milestone._id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const started = res.body.data.roadmap.milestones.find((m) => m._id === milestone._id);
    assert.equal(started.status, 'in_progress');
    assert.equal(res.body.data.roadmap.completionPercentage, 0);
  });

  test('completing the linked assessment auto-completes the milestone', async () => {
    // Quant milestone is already in_progress; completing quant flags it done.
    const before = await getRoadmap();
    const quantMilestone = before.milestones.find((m) => m.status === 'in_progress');
    const completedBefore = before.milestones.filter((m) => m.status === 'completed').length;

    const res = await completeQuantAssessment();
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.completedMilestone, 'submit reports the completed milestone');

    const after = await getRoadmap();
    const done = after.milestones.find((m) => m._id === quantMilestone._id);
    assert.equal(done.status, 'completed');
    assert.ok(done.completedAt, 'completedAt stamped');
    const completedAfter = after.milestones.filter((m) => m.status === 'completed').length;
    assert.equal(completedAfter, completedBefore + 1);
    assert.ok(after.completionPercentage > 0);
  });

  test('completion is persisted and starting a completed milestone is rejected', async () => {
    const roadmap = await getRoadmap();
    const done = roadmap.milestones.find((m) => m.status === 'completed');
    assert.ok(done, 'a milestone completed');
    assert.ok(done.completedAt);

    const fresh = await getRoadmap();
    const again = fresh.milestones.find((m) => m._id === done._id);
    assert.equal(again.status, 'completed');
    assert.ok(again.completedAt);

    const res = await startMilestone(done._id);
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.message, /already completed/i);
  });

  test('PATCH completed directly is rejected with a guidance message', async () => {
    const roadmap = await getRoadmap();
    const milestone = roadmap.milestones.find((m) => m.status === 'pending');
    const res = await auth(
      request(app).patch(`/api/roadmap/milestones/${milestone._id}`)
    ).send({ status: 'completed' });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.message, /completed automatically/i);
  });

  test('a duplicate attempt submission cannot double-complete milestones', async () => {
    const freshSession = await registerUser(request(app), { email: `dup-${Date.now()}@test.dev` });
    const authFresh = (r) => r.set('Authorization', `Bearer ${freshSession.token}`);
    const before = await authFresh(request(app).get('/api/roadmap'));
    const quantMilestone = before.body.data.roadmap.milestones.find((m) => m.category === 'quant');

    const start = await authFresh(request(app).post('/api/assessments/quant/start')).send({});
    const { attemptId, assessment } = start.body.data;
    const answers = assessment.questions.map((q) => ({
      questionId: q.id,
      value: q.type === 'mcq' ? q.options[0].key : 'a reasonable answer',
    }));
    await authFresh(request(app).post('/api/assessments/quant/submit')).send({
      attemptId,
      answers,
      timeTakenSeconds: 30,
    });

    const resubmit = await authFresh(request(app).post('/api/assessments/quant/submit')).send({
      attemptId,
      answers,
      timeTakenSeconds: 30,
    });
    assert.equal(resubmit.status, 409, 'already submitted attempt is rejected');

    const after = await authFresh(request(app).get('/api/roadmap'));
    const done = after.body.data.roadmap.milestones.find((m) => m._id === quantMilestone._id);
    assert.equal(done.status, 'completed');
    assert.equal(
      after.body.data.roadmap.milestones.filter((m) => m.status === 'completed').length,
      1,
      'milestone completed exactly once'
    );
  });

  test('start with a malformed milestone id returns 400', async () => {
    const res = await auth(request(app).patch('/api/roadmap/milestones/nope/start')).send({});
    assert.equal(res.status, 400);
    assert.match(res.body.message, /milestone id/i);
  });

  test('start with a well formed but unknown id returns 404', async () => {
    const res = await auth(
      request(app).patch(`/api/roadmap/milestones/${new mongoose.Types.ObjectId()}/start`)
    ).send({});
    assert.equal(res.status, 404);
  });
});