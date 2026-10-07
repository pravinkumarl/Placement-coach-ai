import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
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

describe('GET /api/users/profile', () => {
  test('returns the signed-in user profile', async () => {
    const res = await auth(request(app).get('/api/users/profile'));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.user.email);
    assert.equal(res.body.data.user.passwordHash, undefined);
  });
});

describe('PATCH /api/users/profile', () => {
  test('updates editable fields', async () => {
    const res = await auth(request(app).patch('/api/users/profile')).send({
      bio: 'Final year CSE student targeting SDE roles.',
      skills: ['JavaScript', 'DSA'],
      cgpa: 8.4,
      graduationYear: 2026,
      targetRole: 'Software Engineer',
      social: { github: 'https://github.com/test', linkedin: 'https://linkedin.com/in/test' },
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const user = res.body.data.user;
    assert.match(user.bio, /Final year/);
    assert.deepEqual(user.skills, ['JavaScript', 'DSA']);
    assert.equal(user.cgpa, 8.4);
    assert.equal(user.targetRole, 'Software Engineer');

    const check = await auth(request(app).get('/api/users/profile'));
    assert.match(check.body.data.user.bio, /Final year/);
  });

  test('rejects an out-of-range cgpa', async () => {
    const res = await auth(request(app).patch('/api/users/profile')).send({ cgpa: 14 });
    assert.equal(res.status, 400);
  });

  test('refuses to change the email', async () => {
    const res = await auth(request(app).patch('/api/users/profile')).send({
      email: 'changed@somewhere.dev',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /email/i);
  });
});

describe('PATCH /api/users/password', () => {
  test('changes the password after a valid current password check', async () => {
    const fresh = await registerUser(request(app), { password: 'Original123' });

    const change = await request(app)
      .patch('/api/users/password')
      .set('Authorization', `Bearer ${fresh.token}`)
      .send({ currentPassword: 'Original123', newPassword: 'BrandNew123' });
    assert.equal(change.status, 200, JSON.stringify(change.body));

    const wrongLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: fresh.email, password: 'Original123' });
    assert.equal(wrongLogin.status, 401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: fresh.email, password: 'BrandNew123' });
    assert.equal(newLogin.status, 200);
  });

  test('rejects an incorrect current password', async () => {
    const fresh = await registerUser(request(app), { password: 'Original123' });
    const res = await request(app)
      .patch('/api/users/password')
      .set('Authorization', `Bearer ${fresh.token}`)
      .send({ currentPassword: 'NotMyPassword1', newPassword: 'BrandNew123' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /current password/i);
  });

  test('rejects a short new password', async () => {
    const fresh = await registerUser(request(app), { password: 'Original123' });
    const res = await request(app)
      .patch('/api/users/password')
      .set('Authorization', `Bearer ${fresh.token}`)
      .send({ currentPassword: 'Original123', newPassword: 'short' });
    assert.equal(res.status, 400);
  });
});

describe('GET /api/dashboard', () => {
  test('returns a dashboard for a new student', async () => {
    const res = await auth(request(app).get('/api/dashboard'));
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const data = res.body.data;
    assert.ok(data, 'dashboard data present');
    assert.ok('stats' in data || 'summary' in data, 'has stats or summary');
    const raw = JSON.stringify(data);
    assert.ok(!raw.includes('passwordHash'), 'no password hash');
    assert.ok(!raw.includes('correctKey'), 'no answer keys');
  });

  test('reflects an attempt once one exists', async () => {
    const start = await auth(request(app).post('/api/assessments/quant/start')).send({});
    const { attemptId } = start.body.data;
    const questions = start.body.data.assessment.questions;
    const answers = questions.map((q) => ({
      questionId: q._id || q.id,
      value: q.type === 'mcq' ? q.options[0].key : 'answer text',
    }));

    await auth(request(app).post('/api/assessments/quant/submit')).send({
      attemptId,
      answers,
      timeTakenSeconds: 100,
    });

    const res = await auth(request(app).get('/api/dashboard'));
    assert.equal(res.status, 200);
    const raw = JSON.stringify(res.body.data);
    assert.ok(/quant|Quant/i.test(raw), 'dashboard mentions the completed module');
  });
});
