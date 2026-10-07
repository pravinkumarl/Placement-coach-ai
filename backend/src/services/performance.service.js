import mongoose from 'mongoose';
import TopicPerformance from '../models/TopicPerformance.js';
import Roadmap from '../models/Roadmap.js';
import User from '../models/User.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';

/**
 * Fold the topic results of a graded attempt into the per topic aggregates.
 */
export async function recordAttemptPerformance(userId, attempt) {
  for (const result of attempt.topicResults || []) {
    const topic = String(result.topic || '').trim();
    if (!topic) continue;

    const existing = await TopicPerformance.findOne({ userId, topic });

    if (!existing) {
      await TopicPerformance.create({
        userId,
        topic,
        category: result.category || '',
        attempts: 1,
        correct: result.correct || 0,
        total: result.total || 0,
        averageScore: result.percentage || 0,
        lastAttemptAt: attempt.completedAt || new Date(),
      });
      continue;
    }

    const previousWeight = existing.attempts;
    const nextWeight = previousWeight + 1;
    existing.attempts = nextWeight;
    existing.correct += result.correct || 0;
    existing.total += result.total || 0;
    existing.averageScore = Math.round(
      (previousWeight * existing.averageScore + (result.percentage || 0)) / nextWeight
    );
    existing.lastAttemptAt = attempt.completedAt || new Date();
    if (result.category && !existing.category) existing.category = result.category;
    await existing.save();
  }
}

/**
 * Combined readiness score:
 *   70% average assessment performance + 30% roadmap completion
 * Recomputed and stored on the user whenever scores change.
 * @returns {Promise<number>} 0..100
 */
export async function recalculateReadiness(userId) {
  const [attemptAgg, roadmap] = await Promise.all([
    AssessmentAttempt.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(String(userId)), status: 'completed' } },
      { $group: { _id: null, avg: { $avg: '$percentage' } } },
    ]),
    Roadmap.findOne({ userId }).select('completionPercentage').lean(),
  ]);

  const assessmentScore = attemptAgg[0]?.avg ?? 0;
  const roadmapScore = roadmap?.completionPercentage ?? 0;
  const readiness = Math.round(assessmentScore * 0.7 + roadmapScore * 0.3);

  await User.updateOne({ _id: userId }, { $set: { readinessScore: readiness } });
  return readiness;
}

export default { recordAttemptPerformance, recalculateReadiness };
