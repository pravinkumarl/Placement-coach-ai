import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getApp, startTestDb, stopTestDb, resetDb, registerUser } from './setup.js';

let app;

before(async () => {
  await startTestDb();
  app = await getApp();
  await resetDb();
});

after(async () => {
  await stopTestDb();
});

describe('POST /api/auth/register', () => {
  test('creates an account, returns a token and a safe user payload', async () => {
    const { token, user, email } = await registerUser(request(app));

    assert.ok(token && token.split('.').length === 3, 'JWT should have three parts');
    assert.equal(user.email, email);
    assert.equal(user.passwordHash, undefined, 'password hash must never leak');
    assert.ok(user.name);
  });

  test('rejects a duplicate email with 409', async () => {
    const { email, password } = await registerUser(request(app));
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Copy Cat', email, password });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
  });

  test('rejects invalid payloads with 400', async () => {
    const cases = [
      { name: 'A', email: 'a@b.com', password: 'Password123' }, // name too short
      { name: 'Valid Name', email: 'not-an-email', password: 'Password123' },
      { name: 'Valid Name', email: 'ok@test.dev', password: 'short' },
      { email: 'ok@test.dev', password: 'Password123' },
    ];

    for (const body of cases) {
      const res = await request(app).post('/api/auth/register').send(body);
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
      assert.equal(res.body.success, false);
    }
  });

  test('creates a default roadmap for the new student', async () => {
    const { token } = await registerUser(request(app));
    const res = await request(app)
      .get('/api/roadmap')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.roadmap.milestones));
    assert.ok(res.body.data.roadmap.milestones.length >= 5);
    assert.equal(res.body.data.roadmap.completionPercentage, 0);
    assert.ok(res.body.data.roadmap.milestones.every((m) => m.status === 'pending'));
  });
});

describe('POST /api/auth/login', () => {
  test('returns a token for valid credentials', async () => {
    const { email, password } = await registerUser(request(app));
    const res = await request(app).post('/api/auth/login').send({ email, password });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.email, email);
  });

  test('rejects a wrong password with 401', async () => {
    const { email } = await registerUser(request(app));
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword999' });

    assert.equal(res.status, 401);
    assert.match(res.body.message, /incorrect email or password/i);
  });

  test('rejects an unknown account with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.dev', password: 'Password123' });

    assert.equal(res.status, 401);
  });
});

describe('GET /api/auth/me', () => {
  test('returns the signed in user', async () => {
    const { token, email } = await registerUser(request(app));
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, email);
    assert.equal(res.body.data.user.passwordHash, undefined);
  });

  test('rejects a missing token', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  test('rejects a garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer nonsense');
    assert.equal(res.status, 401);
  });

  test('rejects a token signed with a different secret', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ sub: '64b000000000000000000000' }, 'another-secret-value');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    assert.equal(res.status, 401);
  });
});
