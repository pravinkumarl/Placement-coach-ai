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
const AI_DISABLED = /GEMINI_API_KEY|AI features are disabled/i;

describe('AI endpoints without a configured key', () => {
  test('POST /api/chat/gemini returns 503 with a clear message', async () => {
    const res = await auth(request(app).post('/api/chat/gemini')).send({
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      systemPrompt: 'You are a placement coach.',
    });

    assert.equal(res.status, 503, JSON.stringify(res.body));
    assert.equal(res.body.success, false);
    assert.match(res.body.message, AI_DISABLED);
  });

  test('POST /api/chat/gemini validates the payload before calling AI', async () => {
    const res = await auth(request(app).post('/api/chat/gemini')).send({ contents: [] });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /contents/i);
  });

  test('POST /api/chat returns 503 without a key', async () => {
    const res = await auth(request(app).post('/api/chat')).send({ message: 'Hi' });
    assert.equal(res.status, 503);
    assert.match(res.body.message, AI_DISABLED);
  });

  test('POST /api/gemini/text returns 503 without a key', async () => {
    const res = await auth(request(app).post('/api/gemini/text')).send({ prompt: 'Say hi' });
    assert.equal(res.status, 503);
    assert.match(res.body.message, AI_DISABLED);
  });

  test('POST /api/gemini/text still validates a missing prompt with 400', async () => {
    const res = await auth(request(app).post('/api/gemini/text')).send({});
    assert.equal(res.status, 400);
    assert.match(res.body.message, /prompt/i);
  });

  test('anonymous callers are rejected before any AI call', async () => {
    const res = await request(app)
      .post('/api/chat/gemini')
      .send({ contents: [{ role: 'user', parts: [{ text: 'x' }] }] });
    assert.equal(res.status, 401);
  });
});

describe('conversation persistence', () => {
  test('starts with no saved conversations', async () => {
    const res = await auth(request(app).get('/api/chat/sessions'));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.sessions, []);
  });

  test('a failed AI reply still keeps the user message in a new session', async () => {
    const res = await auth(request(app).post('/api/chat/messages')).send({
      content: 'How do I prepare for interviews?',
    });

    assert.equal(res.status, 503, 'reply fails without a key');

    const list = await auth(request(app).get('/api/chat/sessions'));
    assert.equal(list.body.data.sessions.length, 1, 'session was created');
    assert.ok(list.body.data.sessions[0].messageCount >= 1);
  });

  test('requires content', async () => {
    const res = await auth(request(app).post('/api/chat/messages')).send({ content: '' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /content/i);
  });

  test('returns 404 for another users / unknown session', async () => {
    const unknown = await auth(
      request(app).get(`/api/chat/sessions/${new mongoose.Types.ObjectId()}`)
    );
    assert.equal(unknown.status, 404);

    const invalid = await auth(request(app).get('/api/chat/sessions/bogus'));
    assert.equal(invalid.status, 400);

    const other = await registerUser(request(app));
    const mine = await auth(request(app).get('/api/chat/sessions'));
    const stolen = await request(app)
      .get(`/api/chat/sessions/${mine.body.data.sessions[0]._id}`)
      .set('Authorization', `Bearer ${other.token}`);
    assert.equal(stolen.status, 404, 'sessions are scoped to their owner');
  });

  test('DELETE removes a conversation', async () => {
    const list = await auth(request(app).get('/api/chat/sessions'));
    const id = list.body.data.sessions[0]._id;

    const res = await auth(request(app).delete(`/api/chat/sessions/${id}`));
    assert.equal(res.status, 200);

    const after = await auth(request(app).get('/api/chat/sessions'));
    assert.ok(!after.body.data.sessions.some((s) => s._id === id));
  });
});
