import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getApp, startTestDb, stopTestDb, resetDb } from './setup.js';

let app;

before(async () => {
  await startTestDb();
  app = await getApp();
  await resetDb();
});

after(async () => {
  await stopTestDb();
});

describe('health & availability', () => {
  test('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ok');
  });

  test('unknown API route returns JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /not found/i);
  });

  test('protected API routes reject anonymous requests', async () => {
    const res = await request(app).get('/api/dashboard');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  test('server source is not served by the static handler', async () => {
    const res = await request(app).get('/backend/src/config/env.js');
    assert.equal(res.status, 404);
  });

  test('malformed JSON body returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ not json');
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });
});
