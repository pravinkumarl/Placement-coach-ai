import mongoose from 'mongoose';
import TopicPerformance from '../models/TopicPerformance.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import { sendSuccess, asyncHandler } from '../utils/response.js';

/**
 * Shared computation behind GET /api/performance, /topics and /history.
 */
export async function computePerformance(user) {
  const userId = new mongoose.Types.ObjectId(String(user._id));

  const [topics, attempts, aggregate] = await Promise.all([
    TopicPerformance.find({ userId }).sort({ averageScore: -1 }).lean(),
    AssessmentAttempt.find({ userId, status: 'completed' })
      .sort('-completedAt')
      .limit(100)
      .select(
        'title moduleKey category percentage score correctAnswers questionCount topicResults completedAt timeTakenSeconds'
      )
      .lean(),
    AssessmentAttempt.aggregate([
      { $match: { userId, status: 'completed' } },
      {
        $group: {
          _id: null,
          average: { $avg: '$percentage' },
          best: { $max: '$percentage' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const summary = aggregate[0] || {};

  return {
    summary: {
      totalAttempts: attempts.length,
      averageScore: Math.round(summary.average || 0),
      bestScore: Math.round(summary.best || 0),
      readinessScore: user.readinessScore ?? 0,
      strongCount: topics.filter((t) => t.averageScore >= 70).length,
      weakCount: topics.filter((t) => t.averageScore < 70).length,
    },
    topics: topics.map((t) => ({
      topic: t.topic,
      category: t.category,
      attempts: t.attempts,
      averageScore: t.averageScore,
      correct: t.correct,
      total: t.total,
      lastAttemptAt: t.lastAttemptAt,
      strength: t.averageScore >= 70 ? 'strong' : 'needs_work',
    })),
    attempts,
  };
}

/**
 * GET /api/performance
 * Everything the performance page needs in one call.
 */
export const getPerformance = asyncHandler(async (req, res) => {
  return sendSuccess(res, await computePerformance(req.user));
});

/**
 * GET /api/performance/topics
 * Topic strengths/weaknesses calculated from actual attempts.
 */
export const getPerformanceTopics = asyncHandler(async (req, res) => {
  const data = await computePerformance(req.user);
  return sendSuccess(res, { topics: data.topics, summary: data.summary });
});

/**
 * GET /api/performance/history
 * Attempt history (newest first).
 */
export const getPerformanceHistory = asyncHandler(async (req, res) => {
  const data = await computePerformance(req.user);
  return sendSuccess(res, {
    attempts: data.attempts,
    trend: data.attempts
      .slice()
      .reverse()
      .map((a) => ({ date: a.completedAt, score: a.percentage, title: a.title })),
  });
});

/**
 * GET /api/performance/insights
 * Compact coaching tips derived from stored data (no AI required).
 */
export const getInsights = asyncHandler(async (req, res) => {
  const userId = new mongoose.Types.ObjectId(String(req.user._id));

  const topics = await TopicPerformance.find({ userId }).sort('averageScore').lean();
  const attempts = await AssessmentAttempt.find({ userId, status: 'completed' })
    .sort('-completedAt')
    .limit(10)
    .lean();

  const weak = topics.filter((t) => t.averageScore < 70).slice(0, 3);
  const recent = attempts[0];

  const insights = [];
  if (weak.length > 0) {
    insights.push({
      type: 'weak_area',
      title: `Focus on ${weak.map((t) => t.topic).join(', ')}`,
      detail: 'These topics scored below 70% across your attempts. Schedule dedicated practice blocks.',
    });
  }
  if (recent) {
    insights.push({
      type: 'recent_result',
      title: `${recent.title}: ${recent.percentage}%`,
      detail:
        recent.percentage >= 70
          ? 'Solid result. Move to a harder module to keep progressing.'
          : 'Below target. Review the wrong answers and retry this module.',
    });
  }
  if (topics.length === 0) {
    insights.push({
      type: 'getting_started',
      title: 'Take your first assessment',
      detail: 'Your performance insights appear after your first graded attempt.',
    });
  }

  return sendSuccess(res, { insights });
});

export default { getPerformance, getPerformanceTopics, getPerformanceHistory, getInsights };
