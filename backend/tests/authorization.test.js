import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getApp, startTestDb, stopTestDb, resetDb, registerUser } from './setup.js';

let app;
let userA;
let userB;

before(async () => {
  await startTestDb();
  app = await getApp();
  await resetDb({ seedAssessments: true });
  userA = await registerUser(request(app), { name: 'Alice Owner' });
  userB = await registerUser(request(app), { name: 'Bob Intruder' });
});

after(async () => {
  await stopTestDb();
});

const asUser = (token) => ({ Authorization: `Bearer ${token}` });

describe('authentication gates', () => {
  const protectedRoutes = [
    ['GET', '/api/dashboard'],
    ['GET', '/api/users/me'],
    ['GET', '/api/assessments'],
    ['GET', '/api/assessments/attempts'],
    ['GET', '/api/performance'],
    ['GET', '/api/roadmap'],
    ['GET', '/api/interviews'],
    ['GET', '/api/chat/sessions'],
    ['POST', '/api/chat/messages'],
  ];

  for (const [method, path] of protectedRoutes) {
    test(`${method} ${path} rejects a missing token with 401`, async () => {
      const res = await request(app)[method.toLowerCase()](path)
        .set('Content-Type', 'application/json')
        .send(method === 'GET' ? undefined : {});
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.ok(!JSON.stringify(res.body).includes('at Object'), 'must not leak a stack trace');
    });

    test(`${method} ${path} rejects a malformed token with 401`, async () => {
      const res = await request(app)[method.toLowerCase()](path)
        .set('Authorization', 'Bearer not.a.jwt')
        .set('Content-Type', 'application/json')
        .send(method === 'GET' ? undefined : {});
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });
  }
});

describe('assessment attempt integrity', () => {
  test('a foreign user cannot submit another users attempt (404)', async () => {
    const start = await request(app)
      .post('/api/assessments/coding/start')
      .set(asUser(userA.token))
      .send({});
    assert.equal(start.status, 201);
    const { attemptId } = start.body.data;

    const foreign = await request(app)
      .post('/api/assessments/coding/submit')
      .set(asUser(userB.token))
      .send({ attemptId, answers: [], timeTakenSeconds: 10 });

    assert.equal(foreign.status, 404);
    assert.equal(foreign.body.success, false);

    const owner = await request(app)
      .post('/api/assessments/coding/submit')
      .set(asUser(userA.token))
      .send({
        attemptId,
        answers: start.body.data.assessment.questions.map((q) => ({
          questionId: q.id,
          value: q.type === 'mcq' ? q.options[0].key : 'owned answer',
        })),
        timeTakenSeconds: 12,
      });
    assert.equal(owner.status, 200, 'the real owner can still submit');
  });

  test('a duplicate submit of the same attempt is rejected with 409', async () => {
    const history = await request(app)
      .get('/api/assessments/history')
      .set(asUser(userA.token));
    assert.equal(history.status, 200);
    const attemptId = history.body.data.attempts[0]._id;

    const second = await request(app)
      .post('/api/assessments/coding/submit')
      .set(asUser(userA.token))
      .send({ attemptId, answers: [], timeTakenSeconds: 5 });

    assert.equal(second.status, 409);
    assert.equal(second.body.success, false);
  });

  test('a malformed attemptId is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/assessments/coding/submit')
      .set(asUser(userA.token))
      .send({ attemptId: 'not-an-object-id', answers: [], timeTakenSeconds: 5 });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('an unknown attemptId is rejected with 404', async () => {
    const res = await request(app)
      .post('/api/assessments/coding/submit')
      .set(asUser(userA.token))
      .send({
        attemptId: '507f1f77bcf86cd799439011',
        answers: [],
        timeTakenSeconds: 5,
      });
    assert.equal(res.status, 404);
  });

  test('cross-user attempts never leak into another users history', async () => {
    const history = await request(app)
      .get('/api/assessments/history')
      .set(asUser(userB.token));
    assert.equal(history.status, 200);
    assert.equal(history.body.data.attempts.length, 0);

    const stats = await request(app)
      .get('/api/assessments/stats')
      .set(asUser(userB.token));
    assert.equal(stats.status, 200);
    assert.equal(stats.body.data.totalAssessments, 0);
  });
});

describe('chat session isolation', () => {
  let session;

  before(async () => {
    const created = await request(app)
      .post('/api/chat/sessions')
      .set(asUser(userA.token))
      .send({ title: 'Alice private chat' });
    assert.equal(created.status, 201);
    session = created.body.data.session;
    await request(app)
      .post(`/api/chat/sessions/${session._id}/messages`)
      .set(asUser(userA.token))
      .send({ content: 'confidential plan' });
  });

  test('another user cannot read a session or its messages (404)', async () => {
    const one = await request(app)
      .get(`/api/chat/sessions/${session._id}`)
      .set(asUser(userB.token));
    assert.equal(one.status, 404);

    const many = await request(app)
      .get(`/api/chat/sessions/${session._id}/messages`)
      .set(asUser(userB.token));
    assert.equal(many.status, 404);
  });

  test('another user cannot post into or delete a foreign session (404)', async () => {
    const post = await request(app)
      .post(`/api/chat/sessions/${session._id}/messages`)
      .set(asUser(userB.token))
      .send({ content: 'intrusion attempt' });
    assert.equal(post.status, 404);

    const del = await request(app)
      .delete(`/api/chat/sessions/${session._id}`)
      .set(asUser(userB.token));
    assert.equal(del.status, 404);

    const messages = await request(app)
      .get(`/api/chat/sessions/${session._id}/messages`)
      .set(asUser(userA.token));
    assert.equal(messages.status, 200);
    assert.equal(messages.body.data.messages.length, 1, 'original message must be untouched');
  });
});

describe('interview isolation', () => {
  let interviewId;

  before(async () => {
    const created = await request(app)
      .post('/api/interviews')
      .set(asUser(userA.token))
      .send({ type: 'hr', questionCount: 3 });
    assert.equal(created.status, 201);
    interviewId = created.body.data.session._id;
  });

  test('another user cannot read a foreign interview (404)', async () => {
    const res = await request(app)
      .get(`/api/interviews/${interviewId}`)
      .set(asUser(userB.token));
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  test('another user cannot answer or complete a foreign interview (404)', async () => {
    const owner = await request(app)
      .get(`/api/interviews/${interviewId}`)
      .set(asUser(userA.token));
    const questionId = owner.body.data.session.questions[0].id;

    const answer = await request(app)
      .post(`/api/interviews/${interviewId}/answers`)
      .set(asUser(userB.token))
      .send({ questionId, answer: 'intruding answer text' });
    assert.equal(answer.status, 404);

    const complete = await request(app)
      .post(`/api/interviews/${interviewId}/complete`)
      .set(asUser(userB.token))
      .send({});
    assert.equal(complete.status, 404);
  });

  test('interview lists are scoped to the requesting user', async () => {
    const mine = await request(app)
      .get('/api/interviews')
      .set(asUser(userB.token));
    assert.equal(mine.status, 200);
    const ids = (mine.body.data.sessions || mine.body.data.interviews || []).map((s) => s._id);
    assert.ok(!ids.includes(interviewId), "Bob's list must not contain Alice's interview");
  });
});

describe('roadmap isolation', () => {
  let milestoneId;

  before(async () => {
    const created = await request(app)
      .post('/api/roadmap')
      .set(asUser(userA.token))
      .send({ title: 'Alice milestone', category: 'coding' });
    assert.equal(created.status, 201);
    milestoneId = created.body.data.roadmap.milestones.find((m) => m.title === 'Alice milestone')._id;
  });

  test('another user cannot update or delete a foreign milestone (404)', async () => {
    const status = await request(app)
      .patch(`/api/roadmap/${milestoneId}/status`)
      .set(asUser(userB.token))
      .send({ status: 'completed' });
    assert.equal(status.status, 404);

    const del = await request(app)
      .delete(`/api/roadmap/${milestoneId}`)
      .set(asUser(userB.token));
    assert.equal(del.status, 404);

    const owner = await request(app)
      .get('/api/roadmap')
      .set(asUser(userA.token));
    const ms = owner.body.data.roadmap.milestones.find((m) => m._id === milestoneId);
    assert.ok(ms, "Alice's milestone must still exist");
    assert.notEqual(ms.status, 'completed', "Alice's milestone status must be untouched");
  });

  test('roadmap reads return only the requesting users roadmap', async () => {
    const res = await request(app)
      .get('/api/roadmap')
      .set(asUser(userB.token));
    assert.equal(res.status, 200);
    const titles = (res.body.data.roadmap?.milestones || []).map((m) => m.title);
    assert.ok(!titles.includes('Alice milestone'));
  });
});
