/**
 * Seed the assessment question bank into MongoDB.
 *
 * Usage:
 *   npm run seed            # upsert all assessment modules
 *   npm run seed -- --demo  # also create a demo student account
 *   npm run seed -- --reset # wipe assessment + attempt collections first
 */
import mongoose from 'mongoose';
import env from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import Assessment from '../src/models/Assessment.js';
import User from '../src/models/User.js';
import { ASSESSMENT_MODULES } from '../src/data/assessmentBank.js';
import { hashPassword } from '../src/utils/password.js';
import { ensureDefaultRoadmap } from '../src/services/roadmap.service.js';

const args = process.argv.slice(2);
const withDemo = args.includes('--demo');
const reset = args.includes('--reset');

async function seedAssessments() {
  const entries = Object.entries(ASSESSMENT_MODULES);
  let count = 0;

  for (const [moduleKey, module] of entries) {
    const questions = Array.isArray(module.questions) ? module.questions : [];
    const payload = {
      moduleKey,
      title: module.title,
      category: module.category || '',
      topic: module.topic || '',
      difficulty: module.difficulty || 'Mixed',
      durationMinutes: Number(module.duration) || 45,
      questionCount: questions.length,
      questions,
      isPublished: true,
    };

    await Assessment.updateOne({ moduleKey }, { $set: payload }, { upsert: true });
    count += 1;
    console.log(`  ✓ ${moduleKey.padEnd(15)} ${questions.length} questions — ${module.title}`);
  }

  return count;
}

async function seedDemoUser() {
  const email = 'demo@placementcoach.ai';
  const existing = await User.findOne({ email });

  if (existing) {
    console.log('  ✓ demo user already exists (demo@placementcoach.ai)');
    return existing;
  }

  const user = await User.create({
    name: 'Demo Student',
    email,
    passwordHash: await hashPassword('Demo@12345'),
    college: 'Demo Institute of Technology',
    degree: 'B.Tech',
    branch: 'Computer Science',
    graduationYear: new Date().getFullYear() + 1,
    targetRole: 'Software Engineer',
    skills: ['JavaScript', 'Python', 'DBMS'],
    interests: ['Web Development', 'Cloud'],
    bio: 'Final year student preparing for campus placements.',
  });

  await ensureDefaultRoadmap(user._id);
  console.log('  ✓ demo user created — demo@placementcoach.ai / Demo@12345');
  return user;
}

async function main() {
  console.log('[seed] connecting to MongoDB...');
  await connectDatabase();

  if (reset) {
    console.log('[seed] --reset: clearing assessments and attempts...');
    await Promise.all([Assessment.deleteMany({})]);
  }

  console.log('[seed] seeding assessments...');
  const count = await seedAssessments();
  console.log(`[seed] ${count} assessment module(s) stored.`);

  if (withDemo) {
    console.log('[seed] creating demo account...');
    await seedDemoUser();
  }

  await disconnectDatabase();
  console.log('[seed] done.');
}

main().catch(async (error) => {
  console.error('[seed] failed:', error.message);
  try {
    await mongoose.connection.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
