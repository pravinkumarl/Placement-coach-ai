/**
 * Shared test bootstrap.
 *
 * Environment variables MUST exist before ../src/config/env.js is imported,
 * so this module sets them at the top and the app is loaded dynamically.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const BASE_URI =
  process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/placement_coach_test';

// node --test runs every test file in its own process. Give each file its own
// database so parallel runs never wipe each other's data.
const entryFile = process.argv[1] || '';
const suffix =
  path
    .basename(entryFile)
    .replace(/\.test\.js$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '') || 'suite';

export const TEST_MONGODB_URI = `${BASE_URI}_${suffix}`;

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = TEST_MONGODB_URI;
process.env.JWT_SECRET = process.env.JWT_SECRET || `test-secret-${randomBytes(16).toString('hex')}`;
process.env.PORT = process.env.PORT || '5000';
// Never let a developer machine's real key make tests hit the network.
delete process.env.GEMINI_API_KEY;

let appPromise = null;

export function getApp() {
  if (!appPromise) {
    appPromise = import('../src/app.js').then((mod) => mod.default);
  }
  return appPromise;
}

export async function startTestDb() {
  const { connectDatabase } = await import('../src/config/database.js');
  await connectDatabase(TEST_MONGODB_URI);
}

export async function stopTestDb() {
  const mongoose = (await import('mongoose')).default;
  try {
    if (mongoose.connection?.readyState) await mongoose.connection.dropDatabase();
  } catch {
    // cleanup is best effort
  }
  const { disconnectDatabase } = await import('../src/config/database.js');
  await disconnectDatabase();
}

/**
 * Wipe all collections and re-seed the assessment question bank.
 */
export async function resetDb({ seedAssessments = false } = {}) {
  const mongoose = (await import('mongoose')).default;
  const collections = mongoose.connection.collections;

  for (const name of Object.keys(collections)) {
    await collections[name].deleteMany({});
  }

  if (seedAssessments) {
    const { Assessment } = await import('../src/models/Assessment.js').then((m) => ({
      Assessment: m.default,
    }));
    const { ASSESSMENT_MODULES } = await import('../src/data/assessmentBank.js');

    for (const [moduleKey, module] of Object.entries(ASSESSMENT_MODULES)) {
      await Assessment.updateOne(
        { moduleKey },
        {
          $set: {
            moduleKey,
            title: module.title,
            category: module.category || '',
            durationMinutes: Number(module.duration) || 45,
            questionCount: (module.questions || []).length,
            questions: module.questions || [],
            isPublished: true,
          },
        },
        { upsert: true }
      );
    }
  }
}

/**
 * Register a user and return { token, user, email, password }.
 */
export async function registerUser(request, overrides = {}) {
  const payload = {
    name: 'Test Student',
    email: overrides.email || `student-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.dev`,
    password: overrides.password || 'Password123',
    ...overrides,
  };

  const res = await request.post('/api/auth/register').send(payload);
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    token: res.body.data.token,
    user: res.body.data.user,
    email: payload.email,
    password: payload.password,
  };
}
