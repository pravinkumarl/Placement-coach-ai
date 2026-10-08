// Vercel Serverless entry point.
// Exports the Express app from backend/src/app.js so every /api/* route
// (auth, dashboard, assessments, roadmap, interviews, chat, gemini proxy)
// runs server side with MongoDB + JWT + the Gemini key kept off the browser.
import app from '../backend/src/app.js';
import { connectDatabase } from '../backend/src/config/database.js';

let isSeeding = false;

async function ensureSeedOnEmpty() {
  if (isSeeding) return;
  try {
    const { default: User } = await import('../backend/src/models/User.js');
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      isSeeding = true;
      console.log('[vercel] Empty database detected. Auto-seeding default demo accounts...');
      const { hashPassword } = await import('../backend/src/utils/password.js');
      const { ensureDefaultRoadmap } = await import('../backend/src/services/roadmap.service.js');
      const { ASSESSMENT_MODULES } = await import('../backend/src/data/assessmentBank.js');
      const { default: Assessment } = await import('../backend/src/models/Assessment.js');
      const { default: PlacementDrive } = await import('../backend/src/models/PlacementDrive.js');
      const { default: Notification } = await import('../backend/src/models/Notification.js');

      for (const [moduleKey, module] of Object.entries(ASSESSMENT_MODULES)) {
        const questions = Array.isArray(module.questions) ? module.questions : [];
        await Assessment.updateOne(
          { moduleKey },
          {
            $set: {
              moduleKey,
              title: module.title,
              category: module.category || '',
              topic: module.topic || '',
              difficulty: module.difficulty || 'Mixed',
              durationMinutes: Number(module.duration) || 45,
              questionCount: questions.length,
              questions,
              isPublished: true,
            },
          },
          { upsert: true }
        );
      }

      const demoStudent = await User.create({
        name: 'Demo Student',
        email: 'demo@placementcoach.ai',
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
      await ensureDefaultRoadmap(demoStudent._id);

      const demoAdmin = await User.create({
        name: 'Dr. TPO Placement Officer',
        email: 'admin@placementcoach.ai',
        passwordHash: await hashPassword('Admin@12345'),
        role: 'admin',
        college: 'National Institute of Technology',
        degree: 'PhD',
        branch: 'Placement & Training Cell',
        bio: 'Head of Placement & Career Development Cell.',
      });

      await PlacementDrive.create([
        {
          company: 'Google',
          role: 'Software Development Engineer I (SDE-1)',
          package: '24 LPA',
          description: 'Full-time campus recruitment drive for software engineering graduates.',
          driveDate: new Date(Date.now() + 14 * 86400000),
          applicationDeadline: new Date(Date.now() + 7 * 86400000),
          eligibleBranches: ['CSE', 'IT', 'ECE'],
          minCgpa: 8.0,
          minReadiness: 75,
          status: 'Open',
          createdBy: demoAdmin._id,
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
          status: 'Open',
          createdBy: demoAdmin._id,
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
          status: 'Open',
          createdBy: demoAdmin._id,
        },
      ]);

      await Notification.create([
        {
          title: 'Campus Placement Season 2026-2027 Commenced',
          message: 'All registered students are advised to maintain readiness above 70% for upcoming drives.',
          type: 'announcement',
          targetRole: 'all',
          isPinned: true,
          createdBy: demoAdmin._id,
        },
      ]);

      console.log('[vercel] Auto-seeding finished.');
    }
  } catch (err) {
    console.warn('[vercel] Auto-seed check error:', err.message);
  } finally {
    isSeeding = false;
  }
}

export default async function handler(req, res) {
  try {
    await connectDatabase();
    await ensureSeedOnEmpty();
  } catch (err) {
    console.error('[vercel] MongoDB connection failed:', err.message);
    return res.status(503).json({
      success: false,
      message: 'Database connection failed. Please ensure MONGODB_URI is configured in Vercel settings and allows network access (0.0.0.0/0 on MongoDB Atlas).',
      error: err.message,
    });
  }
  return app(req, res);
}
