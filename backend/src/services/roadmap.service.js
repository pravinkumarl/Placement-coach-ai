import Roadmap from '../models/Roadmap.js';
import User from '../models/User.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import TopicPerformance from '../models/TopicPerformance.js';
import { generateJson } from './gemini.service.js';
import { ApiError } from '../utils/response.js';
import { recalculateReadiness } from './performance.service.js';

/**
 * Neutral starter roadmap — created at registration so the roadmap page is
 * never empty. Contains no fake completion data.
 */
export const DEFAULT_MILESTONES = [
  {
    title: 'Aptitude fundamentals',
    description: 'Revise arithmetic, percentages, ratios and time-speed-distance basics.',
    category: 'quant',
    estimatedHours: 8,
  },
  {
    title: 'Logical reasoning practice',
    description: 'Solve puzzles, sequences, seating arrangement and data sufficiency sets.',
    category: 'logical',
    estimatedHours: 6,
  },
  {
    title: 'Verbal ability and reading',
    description: 'Practice comprehension, para-jumbles, vocabulary and grammar.',
    category: 'verbal',
    estimatedHours: 5,
  },
  {
    title: 'Core CS fundamentals',
    description: 'Revise DBMS, OS and networking concepts asked in written rounds.',
    category: 'dbms',
    estimatedHours: 10,
  },
  {
    title: 'Programming and problem solving',
    description: 'Solve arrays, strings, linked lists, trees, graphs and DP problems.',
    category: 'coding',
    estimatedHours: 20,
  },
  {
    title: 'Projects and resume',
    description: 'Polish two portfolio projects and prepare a one page resume.',
    category: 'hr',
    estimatedHours: 6,
  },
  {
    title: 'Interview preparation',
    description: 'Practice HR, managerial and technical interview answers aloud.',
    category: 'communication',
    estimatedHours: 8,
  },
  {
    title: 'Mock interviews',
    description: 'Complete at least three timed mock interviews with feedback.',
    category: 'hr',
    estimatedHours: 6,
  },
];

/**
 * Create the default roadmap for a new user (idempotent).
 */
export async function ensureDefaultRoadmap(userId) {
  const existing = await Roadmap.findOne({ userId });
  if (existing) return existing;

  return Roadmap.create({
    userId,
    summary: 'Starter plan. Recalculate after your first assessment for a personalised roadmap.',
    focusAreas: ['quant', 'coding', 'communication'],
    milestones: DEFAULT_MILESTONES.map((milestone, index) => ({
      ...milestone,
      order: index + 1,
      status: 'pending',
    })),
    completionPercentage: 0,
    isGenerated: false,
    generatedBy: 'system',
  });
}

/**
 * Build context about the student, then ask Gemini for a personalised plan.
 * Falls back to the default plan when the AI service is unavailable.
 */
export async function generateRoadmap(userId) {
  const [user, attempts, topicStats] = await Promise.all([
    User.findById(userId).lean(),
    AssessmentAttempt.find({ userId, status: 'completed' })
      .sort('-completedAt')
      .limit(10)
      .lean(),
    TopicPerformance.find({ userId }).sort('-averageScore').limit(15).lean(),
  ]);

  if (!user) throw ApiError.notFound('User not found.');

  const weakTopics = topicStats
    .filter((t) => t.averageScore < 70)
    .map((t) => `${t.topic} (${t.averageScore}%)`);
  const strongTopics = topicStats
    .filter((t) => t.averageScore >= 70)
    .map((t) => `${t.topic} (${t.averageScore}%)`);

  const recentAttempts = attempts
    .map((a) => `${a.title || a.moduleKey}: ${a.percentage}%`)
    .join(', ');

  const prompt = [
    'You are an expert placement coach for engineering students in India.',
    'Create a practical, ordered preparation roadmap of 8 to 10 milestones.',
    'Respond with ONLY a JSON object using this exact shape:',
    '{"summary": string, "focusAreas": string[], "milestones": [{"title": string, "description": string, "category": string, "estimatedHours": number}]}',
    'Keep milestones concise and actionable.',
    '',
    `Student profile: ${user.name}, degree ${user.degree || 'engineering'}, branch ${
      user.branch || 'unspecified'
    }, graduating ${user.graduationYear}, target role: ${user.targetRole || 'not set'}.`,
    `Target companies: ${(user.targetCompanies || []).join(', ') || 'not set'}.`,
    `Skills: ${(user.skills || []).join(', ') || 'not set'}.`,
    `Current readiness score: ${user.readinessScore}/100.`,
    `Recent assessments: ${recentAttempts || 'none yet'}.`,
    `Weak topics: ${weakTopics.join(', ') || 'none identified yet'}.`,
    `Strong topics: ${strongTopics.join(', ') || 'none identified yet'}.`,
  ].join('\n');

  try {
    const plan = await generateJson(prompt, { temperature: 0.5 });
    const milestones = Array.isArray(plan.milestones) ? plan.milestones : [];

    if (milestones.length === 0) {
      throw new Error('empty roadmap');
    }

    const roadmap = (await Roadmap.findOne({ userId })) || (await ensureDefaultRoadmap(userId));

    roadmap.summary = String(plan.summary || roadmap.summary || '');
    roadmap.focusAreas = Array.isArray(plan.focusAreas)
      ? plan.focusAreas.slice(0, 8).map((f) => String(f))
      : roadmap.focusAreas;
    roadmap.milestones = milestones.slice(0, 12).map((milestone, index) => ({
      title: String(milestone.title || `Milestone ${index + 1}`).slice(0, 160),
      description: String(milestone.description || '').slice(0, 600),
      category: String(milestone.category || 'general').slice(0, 60),
      order: index + 1,
      status: 'pending',
      estimatedHours: Number(milestone.estimatedHours) || 4,
      completedAt: null,
    }));
    roadmap.isGenerated = true;
    roadmap.generatedBy = 'gemini';
    roadmap.lastGeneratedAt = new Date();
    roadmap.recalculate();

    await roadmap.save();
    await recalculateReadiness(userId);
    return roadmap;
  } catch (error) {
    // AI unavailable (503) → serve the deterministic plan instead of failing the user.
    if (error instanceof ApiError && error.statusCode !== 503) throw error;
    const roadmap = (await Roadmap.findOne({ userId })) || (await ensureDefaultRoadmap(userId));
    roadmap.generatedBy = 'system';
    roadmap.lastGeneratedAt = new Date();
    await roadmap.save();
    return roadmap;
  }
}

export default { ensureDefaultRoadmap, generateRoadmap, DEFAULT_MILESTONES };
