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

async function completeAttempt(moduleKey = 'quant') {
  const start = await auth(request(app).post(`/api/assessments/${moduleKey}/start`)).send({});
  assert.equal(start.status, 201, JSON.stringify(start.body));
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
  assert.equal(submit.status, 200, JSON.stringify(submit.body));
  return submit.body.data.attempt;
}

describe('GET /api/health', () => {
  test('reports status, database and timestamp at the top level', async () => {
    const res = await request(app).get('/api/health');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.database, 'connected');
    assert.ok(!Number.isNaN(Date.parse(res.body.timestamp)), 'timestamp parses');
    assert.equal(res.body.data.status, 'ok');
    assert.equal(res.body.data.database, 'connected');
  });
});

describe('GET/PUT /api/users/me', () => {
  test('GET mirrors /users/profile', async () => {
    const me = await auth(request(app).get('/api/users/me'));
    const profile = await auth(request(app).get('/api/users/profile'));

    assert.equal(me.status, 200, JSON.stringify(me.body));
    assert.equal(me.body.data.user.email, profile.body.data.user.email);
    assert.ok(!('password' in me.body.data.user), 'never leaks the password hash');
  });

  test('PUT updates the profile and persists', async () => {
    const res = await auth(request(app).put('/api/users/me')).send({
      targetRole: 'Backend Developer',
      skills: ['Node.js', 'MongoDB'],
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.user.targetRole, 'Backend Developer');

    const again = await auth(request(app).get('/api/users/me'));
    assert.equal(again.body.data.user.targetRole, 'Backend Developer');
    assert.deepEqual(again.body.data.user.skills, ['Node.js', 'MongoDB']);
  });

  test('PATCH /me behaves like PATCH /profile', async () => {
    const res = await auth(request(app).patch('/api/users/me')).send({ bio: 'Final year CSE student.' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.bio, 'Final year CSE student.');
  });
});

describe('assessment history and results aliases', () => {
  test('GET /api/assessments/history mirrors /attempts', async () => {
    await completeAttempt('quant');

    const history = await auth(request(app).get('/api/assessments/history'));
    const attempts = await auth(request(app).get('/api/assessments/attempts'));

    assert.equal(history.status, 200, JSON.stringify(history.body));
    assert.equal(attempts.status, 200);
    assert.ok(history.body.data.attempts.length >= 1);
    assert.equal(history.body.data.attempts.length, attempts.body.data.attempts.length);
    assert.ok(!JSON.stringify(history.body).includes('correctKey'));
  });

  test('GET /api/assessments/:id/results returns graded attempts with a summary', async () => {
    const res = await auth(request(app).get('/api/assessments/quant/results'));

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.assessment.moduleKey, 'quant');
    assert.ok(res.body.data.attempts.length >= 1);
    assert.equal(res.body.data.results.length, res.body.data.attempts.length);

    const { summary } = res.body.data;
    assert.ok(summary.totalAttempts >= 1);
    assert.ok(summary.averageScore >= 0 && summary.averageScore <= 100);
    assert.ok(summary.bestScore >= summary.averageScore);
    assert.ok(!JSON.stringify(res.body).includes('correctKey'));
  });

  test('GET /api/assessments/nope/results 404s for an unknown module', async () => {
    const res = await auth(request(app).get('/api/assessments/nope/results'));
    assert.equal(res.status, 404);
  });
});

describe('performance aliases', () => {
  test('GET /api/performance/topics returns strengths and weaknesses', async () => {
    const res = await auth(request(app).get('/api/performance/topics'));

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.data.topics));
    assert.ok(res.body.data.topics.length >= 1, 'topic stats derived from attempts');
    for (const topic of res.body.data.topics) {
      assert.ok(typeof topic.topic === 'string');
      assert.ok(Number.isFinite(topic.averageScore));
      assert.ok(topic.strength === 'strong' || topic.strength === 'needs_work');
    }
    assert.ok(Number.isFinite(res.body.data.summary.averageScore));
  });

  test('GET /api/performance/history returns attempts and a score trend', async () => {
    const res = await auth(request(app).get('/api/performance/history'));

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.attempts.length >= 1);
    assert.ok(Array.isArray(res.body.data.trend));
    assert.equal(res.body.data.trend.length, res.body.data.attempts.length);
    const point = res.body.data.trend[res.body.data.trend.length - 1];
    assert.ok(Number.isFinite(point.score));
    assert.ok(!Number.isNaN(Date.parse(point.date)));
  });

  test('GET /api/performance still returns the full payload', async () => {
    const res = await auth(request(app).get('/api/performance'));
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.topics));
    assert.ok(res.body.data.summary);
    assert.ok(Array.isArray(res.body.data.attempts));
  });
});

describe('roadmap milestone CRUD', () => {
  test('POST creates, PUT edits, PATCH completes and DELETE removes a milestone', async () => {
    const created = await auth(request(app).post('/api/roadmap')).send({
      title: 'Practice 2 DSA problems daily',
      description: 'Two easy to medium problems every evening.',
      category: 'coding',
      estimatedHours: 4,
    });

    assert.equal(created.status, 201, JSON.stringify(created.body));
    const custom = created.body.data.roadmap.milestones.find(
      (m) => m.title === 'Practice 2 DSA problems daily'
    );
    assert.ok(custom, 'custom milestone present');
    assert.equal(typeof created.body.data.readinessScore, 'number');

    const edited = await auth(request(app).put(`/api/roadmap/${custom._id}`)).send({
      title: 'Practice 3 DSA problems daily',
      estimatedHours: 6,
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    const afterEdit = edited.body.data.roadmap.milestones.find((m) => m._id === custom._id);
    assert.equal(afterEdit.title, 'Practice 3 DSA problems daily');
    assert.equal(afterEdit.estimatedHours, 6);
    assert.equal(afterEdit.description, 'Two easy to medium problems every evening.');

    const statusRes = await auth(request(app).patch(`/api/roadmap/${custom._id}/status`)).send({
      status: 'completed',
    });
    assert.equal(statusRes.status, 200, JSON.stringify(statusRes.body));
    const done = statusRes.body.data.roadmap.milestones.find((m) => m._id === custom._id);
    assert.equal(done.status, 'completed');
    assert.ok(done.completedAt, 'completedAt stamped');
    assert.ok(statusRes.body.data.readinessScore >= 0);

    const removed = await auth(request(app).delete(`/api/roadmap/${custom._id}`));
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    const roadmap = removed.body.data.roadmap;
    assert.ok(!roadmap.milestones.some((m) => m._id === custom._id), 'milestone gone');
    assert.ok(
      roadmap.milestones.every((m, i) => m.order === i + 1),
      'orders renumbered after delete'
    );
  });

  test('POST rejects a missing title', async () => {
    const res = await auth(request(app).post('/api/roadmap')).send({ description: 'no title' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /title/i);
  });

  test('DELETE 404s for a well formed but unknown milestone id', async () => {
    const res = await auth(request(app).delete(`/api/roadmap/${new mongoose.Types.ObjectId()}`));
    assert.equal(res.status, 404);
  });

  test('PATCH /api/roadmap/:milestoneId/status accepts a bad status with 400', async () => {
    const before = await auth(request(app).get('/api/roadmap'));
    const milestone = before.body.data.roadmap.milestones[0];
    const res = await auth(request(app).patch(`/api/roadmap/${milestone._id}/status`)).send({
      status: 'done',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /status/i);
  });
});

describe('chat sessions', () => {
  test('create, list, fetch and delete conversations', async () => {
    const created = await auth(request(app).post('/api/chat/sessions')).send({ title: 'Aptitude help' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const sessionId = created.body.data.session._id;
    assert.ok(sessionId);

    const list = await auth(request(app).get('/api/chat/sessions'));
    assert.equal(list.status, 200);
    assert.ok(list.body.data.sessions.some((s) => s._id === sessionId));

    const fetched = await auth(request(app).get(`/api/chat/sessions/${sessionId}`));
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.data.session.title, 'Aptitude help');
    assert.deepEqual(fetched.body.data.session.messages, []);

    const messages = await auth(request(app).get(`/api/chat/sessions/${sessionId}/messages`));
    assert.equal(messages.status, 200);
    assert.deepEqual(messages.body.data.messages, []);

    const deleted = await auth(request(app).delete(`/api/chat/sessions/${sessionId}`));
    assert.equal(deleted.status, 200);

    const after = await auth(request(app).get(`/api/chat/sessions/${sessionId}`));
    assert.equal(after.status, 404);
  });

  test('the user message is persisted even when the model is unavailable', async () => {
    const created = await auth(request(app).post('/api/chat/sessions')).send({});
    const sessionId = created.body.data.session._id;

    const post = await auth(request(app).post(`/api/chat/sessions/${sessionId}/messages`)).send({
      content: 'How do I prepare for quant?',
    });
    assert.equal(post.status, 503, JSON.stringify(post.body));
    assert.match(post.body.message, /GEMINI_API_KEY/);

    const messages = await auth(request(app).get(`/api/chat/sessions/${sessionId}/messages`));
    assert.equal(messages.body.data.messages.length, 1);
    assert.equal(messages.body.data.messages[0].role, 'user');
    assert.match(messages.body.data.messages[0].content, /quant/);
    assert.ok(!Number.isNaN(Date.parse(messages.body.data.messages[0].at)));
  });

  test('POST /api/chat with a conversationId keeps history in the database', async () => {
    const created = await auth(request(app).post('/api/chat/sessions')).send({});
    const sessionId = created.body.data.session._id;

    const res = await auth(request(app).post('/api/chat')).send({
      message: 'What is a good resume summary?',
      conversationId: sessionId,
    });
    assert.equal(res.status, 503, JSON.stringify(res.body));
    assert.match(res.body.message, /GEMINI_API_KEY/);

    const messages = await auth(request(app).get(`/api/chat/sessions/${sessionId}/messages`));
    assert.equal(messages.body.data.messages.length, 1);
    assert.match(messages.body.data.messages[0].content, /resume summary/);
  });

  test('another user cannot read a conversation', async () => {
    const created = await auth(request(app).post('/api/chat/sessions')).send({ title: 'Private' });
    const sessionId = created.body.data.session._id;

    const stranger = await registerUser(request(app));
    const res = await request(app)
      .get(`/api/chat/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${stranger.token}`);

    assert.equal(res.status, 404);
  });
});

describe('interview sub-scores', () => {
  test('completion computes communication, technical and problem-solving scores', async () => {
    const created = await auth(request(app).post('/api/interviews')).send({
      type: 'technical',
      questionCount: 5,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const interview = created.body.data.session;

    const richAnswer =
      'In a database an index reduces the scan from a full table to a B-tree lookup. ' +
      'Binary search runs in logarithmic time using slow and fast pointers for floyd cycle ' +
      'detection. TCP is connection oriented and reliable while SOLID principles keep classes small. ' +
      'I solved the hardest technical problem with a systematic approach and measurable impact.';

    for (const question of interview.questions) {
      const res = await auth(
        request(app).post(`/api/interviews/${interview._id}/answers`)
      ).send({ questionId: question.id, answer: richAnswer });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    }

    const completed = await auth(request(app).post(`/api/interviews/${interview._id}/complete`)).send({});
    assert.equal(completed.status, 200, JSON.stringify(completed.body));

    const session = completed.body.data.session;
    assert.equal(session.status, 'completed');
    assert.ok(Number.isFinite(session.overallScore));
    assert.ok(Number.isFinite(session.communicationScore));
    assert.ok(Number.isFinite(session.technicalScore));
    assert.ok(Number.isFinite(session.problemSolvingScore));

    for (const value of [
      session.overallScore,
      session.communicationScore,
      session.technicalScore,
      session.problemSolvingScore,
    ]) {
      assert.ok(value >= 0 && value <= 100, `score in range: ${value}`);
    }

    // Every fallback question belongs to the technical group → equals overall.
    assert.equal(session.technicalScore, session.overallScore);
    assert.ok(Array.isArray(session.strengths));
    assert.ok(Array.isArray(session.weaknesses));
    assert.ok(session.overallFeedback.length > 0);

    const fetched = await auth(request(app).get(`/api/interviews/${interview._id}`));
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.data.session.technicalScore, session.technicalScore);
    assert.ok(fetched.body.data.session.communicationScore >= 0);
  });
});
