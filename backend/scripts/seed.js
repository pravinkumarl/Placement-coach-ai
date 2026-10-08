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
import Question from '../src/models/Question.js';
import PlacementDrive from '../src/models/PlacementDrive.js';
import Notification from '../src/models/Notification.js';
import { ASSESSMENT_MODULES } from '../src/data/assessmentBank.js';
import { hashPassword } from '../src/utils/password.js';
import { ensureDefaultRoadmap } from '../src/services/roadmap.service.js';

const args = process.argv.slice(2);
const withDemo = args.includes('--demo');
const reset = args.includes('--reset');

async function seedAssessmentsAndQuestions() {
  const entries = Object.entries(ASSESSMENT_MODULES);
  let count = 0;
  let questionCount = 0;

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

    // Populate standalone Question collection
    for (const q of questions) {
      const qId = q.id || `${moduleKey}-${Math.random().toString(36).substring(2, 7)}`;
      await Question.updateOne(
        { questionId: qId },
        {
          $set: {
            questionId: qId,
            title: q.title || `Question (${module.title})`,
            question: q.question || '',
            type: q.type || 'mcq',
            category: module.category || 'General',
            topic: q.topic || module.topic || 'General',
            difficulty: q.difficulty || 'Medium',
            marks: q.marks || 1,
            options: Array.isArray(q.options) ? q.options : [],
            correctKey: q.correctKey || '',
            correctAnswer: q.correctAnswer || null,
            hint: q.hint || '',
            explanation: q.explanation || '',
            tags: [moduleKey, q.topic].filter(Boolean),
            isArchived: false,
          },
        },
        { upsert: true }
      );
      questionCount += 1;
    }
  }

  console.log(`  ✓ seeded ${questionCount} questions into Question Bank`);
  return count;
}

async function seedDemoAdmin() {
  const email = 'admin@placementcoach.ai';
  const existing = await User.findOne({ email });

  if (existing) {
    existing.role = 'admin';
    await existing.save();
    console.log('  ✓ demo admin already exists (admin@placementcoach.ai)');
    return existing;
  }

  const admin = await User.create({
    name: 'Dr. TPO Placement Officer',
    email,
    passwordHash: await hashPassword('Admin@12345'),
    role: 'admin',
    college: 'National Institute of Technology',
    degree: 'PhD',
    branch: 'Placement & Training Cell',
    bio: 'Head of Placement & Career Development Cell.',
  });

  console.log('  ✓ demo admin created — admin@placementcoach.ai / Admin@12345 (role: admin)');
  return admin;
}

async function seedPlacementDrivesAndAnnouncements(adminUser) {
  const existingDrive = await PlacementDrive.findOne({ company: 'Google' });
  if (!existingDrive) {
    await PlacementDrive.create([
      {
        company: 'Google',
        role: 'Software Development Engineer I (SDE-1)',
        package: '24 LPA',
        description: 'Full-time campus recruitment drive for software engineering graduates. Strong DSA, algorithms, and system fundamentals required.',
        driveDate: new Date(Date.now() + 14 * 86400000),
        applicationDeadline: new Date(Date.now() + 7 * 86400000),
        eligibleBranches: ['CSE', 'IT', 'ECE'],
        minCgpa: 8.0,
        minReadiness: 75,
        requiredSkills: ['Data Structures', 'Algorithms', 'System Design'],
        maxBacklogs: 0,
        status: 'Open',
        createdBy: adminUser?._id,
      },
      {
        company: 'Microsoft',
        role: 'Cloud Solutions Engineer',
        package: '18 LPA',
        description: 'Recruitment for Azure Core Engineering and Enterprise solutions.',
        driveDate: new Date(Date.now() + 21 * 86400000),
        applicationDeadline: new Date(Date.now() + 10 * 86400000),
        eligibleBranches: ['CSE', 'IT', 'ECE', 'EEE'],
        minCgpa: 7.5,
        minReadiness: 70,
        requiredSkills: ['C# / Java / Python', 'Networking', 'Cloud Basics'],
        maxBacklogs: 0,
        status: 'Open',
        createdBy: adminUser?._id,
      },
      {
        company: 'Tata Consultancy Services (TCS)',
        role: 'Systems Engineer & Digital Specialist',
        package: '7.5 LPA',
        description: 'TCS Digital campus hiring for premium technical development streams.',
        driveDate: new Date(Date.now() + 30 * 86400000),
        applicationDeadline: new Date(Date.now() + 15 * 86400000),
        eligibleBranches: ['CSE', 'IT', 'ECE', 'EEE', 'Mechanical', 'Civil'],
        minCgpa: 6.5,
        minReadiness: 60,
        requiredSkills: ['Quantitative Aptitude', 'DBMS', 'Java / Python / C++'],
        maxBacklogs: 0,
        status: 'Open',
        createdBy: adminUser?._id,
      },
    ]);
    console.log('  ✓ seeded 3 sample placement drives (Google, Microsoft, TCS)');
  }

  const existingNotif = await Notification.findOne({ title: { $regex: /Welcome/i } });
  if (!existingNotif) {
    await Notification.create([
      {
        title: 'Campus Placement Season 2026-2027 Officially Commenced',
        message: 'All registered students are advised to complete their Diagnostic Roadmap and maintain a readiness score above 70% to qualify for upcoming Tier-1 campus drives.',
        type: 'announcement',
        targetRole: 'all',
        isPinned: true,
        createdBy: adminUser?._id,
      },
      {
        title: 'TCS Digital Drive Registration Deadline Approaching',
        message: 'TCS Digital registration closes next week. Ensure all assessment attempts in Aptitude and DBMS are submitted.',
        type: 'drive',
        targetRole: 'student',
        createdBy: adminUser?._id,
      },
    ]);
    console.log('  ✓ seeded institutional announcements');
  }
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
    role: 'student',
    registerNumber: 'REG2024CS042',
    college: 'Demo Institute of Technology',
    degree: 'B.Tech',
    branch: 'Computer Science',
    graduationYear: new Date().getFullYear() + 1,
    cgpa: 8.4,
    backlogs: 0,
    targetRole: 'Software Engineer',
    targetCompanies: ['Google', 'Microsoft', 'Amazon'],
    skills: ['JavaScript', 'Python', 'DBMS', 'Algorithms'],
    interests: ['Web Development', 'Cloud'],
    bio: 'Final year student preparing for campus placements.',
  });

  await ensureDefaultRoadmap(user._id);
  console.log('  ✓ demo student created — demo@placementcoach.ai / Demo@12345');
  return user;
}

async function main() {
  console.log('[seed] connecting to MongoDB...');
  await connectDatabase();

  if (reset) {
    console.log('[seed] --reset: clearing assessments and attempts...');
    await Promise.all([Assessment.deleteMany({}), Question.deleteMany({})]);
  }

  console.log('[seed] seeding assessments & question bank...');
  const count = await seedAssessmentsAndQuestions();
  console.log(`[seed] ${count} assessment module(s) stored.`);

  let adminUser = null;
  if (withDemo) {
    console.log('[seed] creating demo student & admin accounts...');
    await seedDemoUser();
    adminUser = await seedDemoAdmin();
    await seedPlacementDrivesAndAnnouncements(adminUser);
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
