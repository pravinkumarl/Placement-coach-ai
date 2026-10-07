import AssessmentAttempt from '../models/AssessmentAttempt.js';
import Roadmap from '../models/Roadmap.js';
import TopicPerformance from '../models/TopicPerformance.js';
import ChatSession from '../models/ChatSession.js';
import InterviewSession from '../models/InterviewSession.js';
import { sendSuccess, asyncHandler } from '../utils/response.js';

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * GET /api/dashboard
 * One aggregate call powering the dashboard page.
 */
export const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [attempts, roadmap, topics, recentAttempts, chatCount, interviewCount] =
    await Promise.all([
      AssessmentAttempt.find({ userId, status: 'completed' })
        .sort('-completedAt')
        .lean(),
      Roadmap.findOne({ userId }).lean(),
      TopicPerformance.find({ userId }).sort('-averageScore').lean(),
      AssessmentAttempt.find({ userId, status: 'completed' })
        .sort('-completedAt')
        .limit(5)
        .select('title moduleKey category percentage score questionCount correctAnswers completedAt')
        .lean(),
      ChatSession.countDocuments({ userId }),
      InterviewSession.countDocuments({ userId, status: 'completed' }),
    ]);

  const completed = attempts.length;
  const avgScore = completed
    ? Math.round(attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / completed)
    : 0;
  const last30 = attempts.filter((a) => new Date(a.completedAt) >= since);
  const recentTrend = last30
    .slice()
    .reverse()
    .map((a) => ({ date: dayKey(a.completedAt), score: a.percentage, title: a.title }));

  const weakTopics = topics
    .filter((t) => t.averageScore < 70)
    .slice(0, 5)
    .map((t) => ({ topic: t.topic, score: t.averageScore }));
  const strongTopics = topics
    .filter((t) => t.averageScore >= 70)
    .slice(0, 5)
    .map((t) => ({ topic: t.topic, score: t.averageScore }));

  const nextMilestone = (roadmap?.milestones || []).find((m) => m.status !== 'completed') || null;

  const streak = computeStreak(attempts.map((a) => dayKey(a.completedAt)));

  return sendSuccess(res, {
    readinessScore: req.user.readinessScore ?? 0,
    stats: {
      completedAssessments: completed,
      averageScore: avgScore,
      roadmapCompletion: roadmap?.completionPercentage ?? 0,
      assessmentsLast30Days: last30.length,
      chatMessages: chatCount,
      interviewsCompleted: interviewCount,
      studyStreak: streak,
    },
    recentAttempts,
    weakTopics,
    strongTopics,
    roadmap: roadmap
      ? {
          summary: roadmap.summary,
          completionPercentage: roadmap.completionPercentage,
          nextMilestone,
          totalMilestones: (roadmap.milestones || []).length,
        }
      : null,
    trend: recentTrend,
  });
});

function computeStreak(dayKeys) {
  if (dayKeys.length === 0) return 0;
  const unique = [...new Set(dayKeys)].sort().reverse();
  const today = new Date();
  let cursor = dayKey(today);
  if (unique[0] !== cursor) {
    // Allow the streak to survive until the end of the following day.
    cursor = dayKey(new Date(today.getTime() - 24 * 60 * 60 * 1000));
    if (unique[0] !== cursor) return 0;
  }
  let streak = 1;
  for (let i = 1; i < unique.length; i += 1) {
    const previous = new Date(unique[i - 1]);
    const current = new Date(unique[i]);
    const diffDays = Math.round((previous - current) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) streak += 1;
    else break;
  }
  return streak;
}

export default { getDashboard };
