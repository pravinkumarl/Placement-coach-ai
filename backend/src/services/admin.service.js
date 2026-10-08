import mongoose from 'mongoose';
import User from '../models/User.js';
import Assessment from '../models/Assessment.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import TopicPerformance from '../models/TopicPerformance.js';
import PlacementDrive from '../models/PlacementDrive.js';
import DriveApplication from '../models/DriveApplication.js';
import AdminLog from '../models/AdminLog.js';
import Question from '../models/Question.js';
import { classifyReadiness, READINESS_CONFIG, getStudentReadinessBreakdown } from './readiness.service.js';
import geminiService from './gemini.service.js';
import env from '../config/env.js';

/**
 * Log an administrative audit action.
 */
export async function logAdminAction(adminUser, action, resource, resourceId = '', details = {}, result = 'success', req = null) {
  try {
    const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || '';
    await AdminLog.create({
      adminId: adminUser._id,
      adminName: adminUser.name || 'Admin',
      action,
      resource,
      resourceId: String(resourceId || ''),
      details,
      result,
      ipAddress: String(ipAddress).slice(0, 50),
    });
  } catch (err) {
    console.warn('[audit-log] Failed to write log:', err.message);
  }
}

/**
 * Phase 2: High level KPI cards and analytics for Admin Dashboard.
 */
export async function getAdminOverview() {
  const [
    studentCount,
    attemptsCount,
    activeDrivesCount,
    readinessStats,
    branchDistribution,
    recentAttempts,
  ] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    AssessmentAttempt.countDocuments({ status: 'completed' }),
    PlacementDrive.countDocuments({ status: 'Open' }),
    User.aggregate([
      { $match: { role: 'student' } },
      {
        $group: {
          _id: null,
          avgReadiness: { $avg: '$readinessScore' },
          readyCount: {
            $sum: {
              $cond: [{ $gte: ['$readinessScore', READINESS_CONFIG.thresholds.placementReady] }, 1, 0],
            },
          },
          needsImprovementCount: {
            $sum: {
              $cond: [{ $lt: ['$readinessScore', READINESS_CONFIG.thresholds.almostReady] }, 1, 0],
            },
          },
          excellentCount: {
            $sum: {
              $cond: [{ $gte: ['$readinessScore', READINESS_CONFIG.thresholds.excellent] }, 1, 0],
            },
          },
          almostReadyCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$readinessScore', READINESS_CONFIG.thresholds.almostReady] },
                    { $lt: ['$readinessScore', READINESS_CONFIG.thresholds.placementReady] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    User.aggregate([
      { $match: { role: 'student', branch: { $ne: '' } } },
      {
        $group: {
          _id: '$branch',
          studentCount: { $sum: 1 },
          avgReadiness: { $avg: '$readinessScore' },
          avgCgpa: { $avg: '$cgpa' },
        },
      },
      { $sort: { avgReadiness: -1 } },
      { $limit: 8 },
    ]),
    AssessmentAttempt.find({ status: 'completed' })
      .populate('userId', 'name email branch')
      .sort({ completedAt: -1 })
      .limit(6)
      .lean(),
  ]);

  const stats = readinessStats[0] || {
    avgReadiness: 0,
    readyCount: 0,
    needsImprovementCount: 0,
    excellentCount: 0,
    almostReadyCount: 0,
  };

  return {
    kpis: {
      totalStudents: studentCount,
      avgReadinessScore: Math.round(stats.avgReadiness || 0),
      totalAssessmentAttempts: attemptsCount,
      placementReadyStudents: stats.readyCount,
      studentsNeedingImprovement: stats.needsImprovementCount,
      activePlacementDrives: activeDrivesCount,
    },
    distribution: {
      excellent: stats.excellentCount,
      placementReady: stats.readyCount - stats.excellentCount,
      almostReady: stats.almostReadyCount,
      needsImprovement: stats.needsImprovementCount,
    },
    branchAnalytics: branchDistribution.map((b) => ({
      branch: b._id,
      studentCount: b.studentCount,
      avgReadiness: Math.round(b.avgReadiness || 0),
      avgCgpa: b.avgCgpa ? Number(b.avgCgpa.toFixed(2)) : null,
    })),
    recentAttempts: recentAttempts.map((a) => ({
      id: a._id,
      studentName: a.userId?.name || 'Unknown Student',
      studentEmail: a.userId?.email || '',
      branch: a.userId?.branch || '',
      title: a.title || a.moduleKey,
      percentage: a.percentage,
      completedAt: a.completedAt,
    })),
  };
}

/**
 * Phase 4: Paginated student directory with search, filtering, and sorting.
 */
export async function getStudentDirectory(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 15));
  const skip = (page - 1) * limit;

  const filter = { role: 'student' };

  if (query.search) {
    const s = String(query.search).trim();
    filter.$or = [
      { name: { $regex: s, $options: 'i' } },
      { email: { $regex: s, $options: 'i' } },
      { registerNumber: { $regex: s, $options: 'i' } },
      { college: { $regex: s, $options: 'i' } },
    ];
  }

  if (query.branch) {
    filter.branch = { $regex: new RegExp(`^${query.branch.trim()}$`, 'i') };
  }

  if (query.batch || query.graduationYear) {
    filter.graduationYear = parseInt(query.batch || query.graduationYear, 10);
  }

  if (query.minCgpa !== undefined && query.minCgpa !== '') {
    filter.cgpa = { $gte: parseFloat(query.minCgpa) };
  }

  if (query.minReadiness !== undefined && query.minReadiness !== '') {
    filter.readinessScore = { $gte: parseInt(query.minReadiness, 10) };
  }

  if (query.placementStatus) {
    filter.placementStatus = query.placementStatus;
  }

  const sortField = query.sortBy || 'readinessScore';
  const sortDirection = query.sortOrder === 'asc' ? 1 : -1;
  const sortOptions = { [sortField]: sortDirection, _id: -1 };

  const [total, students] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select('name email registerNumber branch graduationYear cgpa readinessScore placementStatus targetCompanies skills lastAssessmentAt createdAt backlogs')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  // Attach attempts count to each student
  const studentIds = students.map((s) => s._id);
  const attemptAgg = await AssessmentAttempt.aggregate([
    { $match: { userId: { $in: studentIds }, status: 'completed' } },
    { $group: { _id: '$userId', count: { $sum: 1 }, avgScore: { $avg: '$percentage' } } },
  ]);

  const attemptMap = new Map();
  attemptAgg.forEach((a) => {
    attemptMap.set(String(a._id), { count: a.count, avgScore: Math.round(a.avgScore || 0) });
  });

  const enriched = students.map((s) => {
    const att = attemptMap.get(String(s._id)) || { count: 0, avgScore: 0 };
    return {
      ...s,
      attemptsCount: att.count,
      avgAttemptScore: att.avgScore,
      tier: classifyReadiness(s.readinessScore || 0),
    };
  });

  return {
    students: enriched,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

/**
 * Phase 5: Student Drill-Down Profile
 */
export async function getStudentDrillDown(studentId) {
  const user = await User.findById(studentId).lean();
  if (!user) return null;

  const breakdownData = await getStudentReadinessBreakdown(studentId);

  const [attempts, topics, applications] = await Promise.all([
    AssessmentAttempt.find({ userId: studentId, status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(20)
      .lean(),
    TopicPerformance.find({ userId: studentId }).sort({ averageScore: -1 }).lean(),
    DriveApplication.find({ studentId }).populate('driveId', 'company role package driveDate status').sort({ appliedAt: -1 }).lean(),
  ]);

  const strongTopics = topics.filter((t) => t.averageScore >= 70).map((t) => ({
    topic: t.topic,
    category: t.category,
    averageScore: t.averageScore,
    attempts: t.attempts,
  }));

  const weakTopics = topics.filter((t) => t.averageScore < 60).map((t) => ({
    topic: t.topic,
    category: t.category,
    averageScore: t.averageScore,
    attempts: t.attempts,
  }));

  return {
    student: {
      ...user,
      tier: classifyReadiness(user.readinessScore || 0),
    },
    readiness: breakdownData,
    strongTopics,
    weakTopics,
    attempts: attempts.map((a) => ({
      id: a._id,
      title: a.title || a.moduleKey,
      moduleKey: a.moduleKey,
      category: a.category,
      percentage: a.percentage,
      score: a.score,
      totalQuestions: a.totalQuestions,
      correctAnswers: a.correctAnswers,
      timeTakenSeconds: a.timeTakenSeconds,
      completedAt: a.completedAt,
    })),
    applications: applications.map((app) => ({
      id: app._id,
      company: app.driveId?.company || 'Unknown',
      role: app.driveId?.role || '',
      package: app.driveId?.package || '',
      status: app.status,
      appliedAt: app.appliedAt,
    })),
  };
}

/**
 * Phase 7: Batch Weakness Analytics & AI Insight
 */
const UNWANTED_TOPICS = ['Blood Relations', 'Seating Arrangement'];

const TOPIC_CATEGORY_MAP = {
  'Time & Work': 'Aptitude & Problem Solving',
  'Profit & Loss': 'Aptitude & Problem Solving',
  'Speed & Distance': 'Aptitude & Problem Solving',
  'Probability': 'Aptitude & Problem Solving',
  'Compound Interest': 'Aptitude & Problem Solving',
  'Syllogisms': 'Logical Reasoning',
  'Coding-Decoding': 'Logical Reasoning',
  'Pattern Series': 'Logical Reasoning',
  'Direction Sense': 'Logical Reasoning',
  'Statement & Assumptions': 'Logical Reasoning',
  'Sentence Correction': 'Verbal Ability',
  'Vocabulary in Context': 'Verbal Ability',
  'Para-Jumbles': 'Verbal Ability',
  'Idioms & Phrases': 'Verbal Ability',
  'Arrays & Hash Maps': 'Data Structures & Algorithms',
  'Dynamic Programming': 'Data Structures & Algorithms',
  'Binary Trees': 'Data Structures & Algorithms',
  'Subqueries & Window Functions': 'Database Systems',
  'JOINs & Group By': 'Database Systems',
  'LEFT JOIN & NULL Checks': 'Database Systems',
  'High-Level System Design': 'Technical Core',
  'Database Indexing & Internals': 'Technical Core',
  'STAR Framework: Conflict Resolution': 'Communication & HR',
  'Handling Pressure & Deadlines': 'Communication & HR',
  'Client Incident Communication': 'Communication & HR',
  'Executive Summary': 'Communication & HR',
};

export async function getBatchWeaknessAnalytics() {
  const [rawTopicStats, branchStats, categoryStats] = await Promise.all([
    TopicPerformance.aggregate([
      {
        $match: {
          topic: { $nin: UNWANTED_TOPICS },
        },
      },
      {
        $group: {
          _id: '$topic',
          category: { $first: '$category' },
          totalAttempts: { $sum: '$attempts' },
          totalStudents: { $sum: 1 },
          avgScore: { $avg: '$averageScore' },
          strugglingCount: {
            $sum: { $cond: [{ $lt: ['$averageScore', 60] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          topic: '$_id',
          category: 1,
          totalAttempts: 1,
          totalStudents: 1,
          avgScore: { $round: ['$avgScore', 1] },
          strugglingPercentage: {
            $round: [
              {
                $multiply: [
                  { $divide: ['$strugglingCount', { $cond: [{ $gt: ['$totalStudents', 0] }, '$totalStudents', 1] }] },
                  100,
                ],
              },
              1,
            ],
          },
        },
      },
      { $sort: { avgScore: 1 } },
    ]),
    User.aggregate([
      { $match: { role: 'student', branch: { $ne: '' } } },
      {
        $group: {
          _id: '$branch',
          avgReadiness: { $avg: '$readinessScore' },
          count: { $sum: 1 },
        },
      },
      { $sort: { avgReadiness: -1 } },
    ]),
    AssessmentAttempt.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$category',
          avgScore: { $avg: '$percentage' },
          attempts: { $sum: 1 },
        },
      },
      { $sort: { avgScore: 1 } },
    ]),
  ]);

  const topicStats = rawTopicStats.map((t) => ({
    ...t,
    category: t.category || TOPIC_CATEGORY_MAP[t.topic] || 'Technical Core',
  }));

  const weakestTopics = topicStats.slice(0, 8);
  const strongestTopics = [...topicStats].sort((a, b) => b.avgScore - a.avgScore).slice(0, 8);

  // Generate or fallback AI placement insight
  let aiInsight = {
    summary: 'Topic Analysis Ready',
    recommendation: 'Encourage students to practice Aptitude and Core Technical assessments to establish baseline metrics.',
    focusAreas: [],
  };

  if (weakestTopics.length > 0) {
    const topWeak = weakestTopics.slice(0, 3).map((w) => `${w.topic} (${w.avgScore}% avg, ${w.strugglingPercentage}% struggling)`).join(', ');
    aiInsight = {
      summary: `Critical Batch Bottleneck Identified: ${weakestTopics[0].topic}`,
      recommendation: `Approximately ${weakestTopics[0].strugglingPercentage}% of students are struggling with ${weakestTopics[0].topic}. Consider scheduling a specialized faculty mentor clinic or targeted workshop for these modules.`,
      focusAreas: weakestTopics.slice(0, 4).map((w) => w.topic),
    };

    // If Gemini API Key is available, invoke AI for dynamic insight
    if (env.geminiApiKey) {
      try {
        const prompt = `You are a Senior Placement Director at an engineering university.
Here are the batch assessment weakness analytics:
Weakest Topics: ${topWeak}
Provide a crisp 2-sentence executive summary and 1 high-impact faculty action plan for the TPO placement dashboard.`;
        const aiText = await geminiService.generateText(prompt, { maxOutputTokens: 250 });
        if (aiText) {
          aiInsight.recommendation = aiText.trim();
        }
      } catch (err) {
        // Gracefully use the deterministic insight
      }
    }
  }

  return {
    weakestTopics,
    strongestTopics,
    branchComparison: branchStats.map((b) => ({ branch: b._id, avgReadiness: Math.round(b.avgReadiness || 0), count: b.count })),
    categoryComparison: categoryStats.map((c) => ({ category: c._id || 'General', avgScore: Math.round(c.avgScore || 0), attempts: c.attempts })),
    aiInsight,
  };
}

/**
 * Phase 10: Drive Eligibility Screener
 */
export async function screenEligibleStudents(criteria = {}) {
  const minCgpa = parseFloat(criteria.minCgpa) || 0;
  const minReadiness = parseInt(criteria.minReadiness, 10) || 0;
  const maxBacklogs = criteria.maxBacklogs !== undefined && criteria.maxBacklogs !== '' ? parseInt(criteria.maxBacklogs, 10) : 100;
  const branches = Array.isArray(criteria.branches) ? criteria.branches : criteria.branches ? [criteria.branches] : [];

  const filter = {
    role: 'student',
    readinessScore: { $gte: minReadiness },
  };

  if (minCgpa > 0) {
    filter.cgpa = { $gte: minCgpa };
  }

  if (maxBacklogs !== 100) {
    filter.backlogs = { $lte: maxBacklogs };
  }

  if (branches.length > 0) {
    filter.branch = { $in: branches.map((b) => new RegExp(`^${b.trim()}$`, 'i')) };
  }

  if (criteria.search) {
    const s = String(criteria.search).trim();
    filter.$or = [
      { name: { $regex: s, $options: 'i' } },
      { email: { $regex: s, $options: 'i' } },
      { registerNumber: { $regex: s, $options: 'i' } },
    ];
  }

  const [totalCount, eligibleStudents] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select('name email registerNumber branch cgpa readinessScore backlogs placementStatus skills targetCompanies phone')
      .sort({ readinessScore: -1, cgpa: -1 })
      .lean(),
  ]);

  return {
    criteria: {
      minCgpa,
      minReadiness,
      maxBacklogs,
      branches,
    },
    eligibleCount: totalCount,
    students: eligibleStudents,
  };
}

/**
 * Phase 13: Export students or eligible list as CSV string.
 */
export function generateStudentsCsv(students) {
  const headers = ['Name', 'Register Number', 'Email', 'Phone', 'Branch', 'CGPA', 'Readiness Score', 'Backlogs', 'Placement Status', 'Target Companies'];
  const rows = students.map((s) => [
    `"${(s.name || '').replace(/"/g, '""')}"`,
    `"${(s.registerNumber || '').replace(/"/g, '""')}"`,
    `"${(s.email || '').replace(/"/g, '""')}"`,
    `"${(s.phone || '').replace(/"/g, '""')}"`,
    `"${(s.branch || '').replace(/"/g, '""')}"`,
    s.cgpa != null ? s.cgpa : '',
    s.readinessScore != null ? s.readinessScore : 0,
    s.backlogs != null ? s.backlogs : 0,
    `"${(s.placementStatus || 'unplaced').replace(/"/g, '""')}"`,
    `"${((s.targetCompanies || []).join('; ')).replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

/**
 * Phase 13: Bulk CSV Import with validation
 */
export async function importStudentsFromCsv(csvText, adminUser) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { success: false, message: 'CSV file is empty or missing data rows.' };
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
  const nameIdx = headers.findIndex((h) => h.includes('name'));
  const emailIdx = headers.findIndex((h) => h.includes('email'));
  const regIdx = headers.findIndex((h) => h.includes('register') || h.includes('roll'));
  const branchIdx = headers.findIndex((h) => h.includes('branch') || h.includes('dept'));
  const cgpaIdx = headers.findIndex((h) => h.includes('cgpa'));

  if (nameIdx === -1 || emailIdx === -1) {
    return { success: false, message: 'CSV must contain at least "name" and "email" columns.' };
  }

  const results = { imported: 0, skipped: 0, errors: [] };

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // Simple CSV parser for quoted or unquoted values
    const cols = (rawLine.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || []).map((c) => c.replace(/^"|"$/g, '').trim());
    if (!cols.length) continue;

    const name = cols[nameIdx];
    const email = String(cols[emailIdx] || '').toLowerCase().trim();
    const registerNumber = regIdx !== -1 ? cols[regIdx] || '' : '';
    const branch = branchIdx !== -1 ? cols[branchIdx] || '' : '';
    const cgpa = cgpaIdx !== -1 ? parseFloat(cols[cgpaIdx]) || null : null;

    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.skipped++;
      results.errors.push(`Row ${i + 1}: Invalid name or email.`);
      continue;
    }

    try {
      const existing = await User.findOne({ email });
      if (existing) {
        // Update profile
        if (registerNumber) existing.registerNumber = registerNumber;
        if (branch) existing.branch = branch;
        if (cgpa !== null) existing.cgpa = cgpa;
        await existing.save();
        results.imported++;
      } else {
        // Create new student
        await User.create({
          name,
          email,
          registerNumber,
          branch,
          cgpa,
          passwordHash: '$2a$10$demoHashedPlaceholderPasswordXYZ12345',
          role: 'student',
        });
        results.imported++;
      }
    } catch (err) {
      results.skipped++;
      results.errors.push(`Row ${i + 1} (${email}): ${err.message}`);
    }
  }

  await logAdminAction(adminUser, 'CSV_IMPORT_STUDENTS', 'User', '', { imported: results.imported, skipped: results.skipped });

  return { success: true, ...results };
}

export default {
  logAdminAction,
  getAdminOverview,
  getStudentDirectory,
  getStudentDrillDown,
  getBatchWeaknessAnalytics,
  screenEligibleStudents,
  generateStudentsCsv,
  importStudentsFromCsv,
};
