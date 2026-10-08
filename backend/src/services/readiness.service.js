import mongoose from 'mongoose';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import Roadmap from '../models/Roadmap.js';
import TopicPerformance from '../models/TopicPerformance.js';
import User from '../models/User.js';

export const READINESS_CONFIG = {
  // Category-based multi-factor weights (Phase 6)
  categoryWeights: {
    aptitude: 0.25,
    coding: 0.25,
    technical: 0.20,
    communication: 0.15,
    interview: 0.15,
  },
  // Default aggregate formula: 70% assessments + 30% roadmap
  defaultWeights: {
    assessment: 0.70,
    roadmap: 0.30,
  },
  thresholds: {
    excellent: 85,
    placementReady: 70,
    almostReady: 55,
  },
};

/**
 * Classify a readiness score into an institutional tier.
 * @param {number} score 0..100
 */
export function classifyReadiness(score) {
  const val = Math.round(Math.max(0, Math.min(100, Number(score) || 0)));
  if (val >= READINESS_CONFIG.thresholds.excellent) {
    return {
      score: val,
      tier: 'Excellent',
      label: 'Excellent (Top Tier)',
      status: 'excellent',
      color: '#10B981',
      bsColor: 'success',
      badgeClass: 'badge-strong',
    };
  }
  if (val >= READINESS_CONFIG.thresholds.placementReady) {
    return {
      score: val,
      tier: 'Placement Ready',
      label: 'Placement Ready',
      status: 'ready',
      color: '#4F46E5',
      bsColor: 'primary',
      badgeClass: 'badge-strong',
    };
  }
  if (val >= READINESS_CONFIG.thresholds.almostReady) {
    return {
      score: val,
      tier: 'Almost Ready',
      label: 'Almost Ready',
      status: 'almost_ready',
      color: '#F59E0B',
      bsColor: 'warning',
      badgeClass: 'badge-improving',
    };
  }
  return {
    score: val,
    tier: 'Needs Improvement',
    label: 'Needs Improvement',
    status: 'needs_improvement',
    color: '#EF4444',
    bsColor: 'danger',
    badgeClass: 'badge-weak',
  };
}

/**
 * Compute breakdown scores across categories (Aptitude, Coding, Technical, Communication, Interview)
 * for a specific student.
 */
export async function getStudentReadinessBreakdown(userId) {
  const userObjectId = new mongoose.Types.ObjectId(String(userId));

  const [attempts, roadmap, topics] = await Promise.all([
    AssessmentAttempt.find({ userId: userObjectId, status: 'completed' })
      .select('category moduleKey percentage score totalQuestions correctAnswers completedAt')
      .sort({ completedAt: -1 })
      .lean(),
    Roadmap.findOne({ userId: userObjectId }).select('completionPercentage milestones').lean(),
    TopicPerformance.find({ userId: userObjectId }).lean(),
  ]);

  const categoryScores = {
    aptitude: [],
    coding: [],
    technical: [],
    communication: [],
    interview: [],
  };

  attempts.forEach((att) => {
    const cat = String(att.category || '').toLowerCase();
    const mod = String(att.moduleKey || '').toLowerCase();
    const pct = typeof att.percentage === 'number' ? att.percentage : 0;

    if (cat.includes('aptitude') || mod.includes('quant') || mod.includes('logical') || mod.includes('verbal')) {
      categoryScores.aptitude.push(pct);
    } else if (cat.includes('code') || mod.includes('coding') || mod.includes('dsa')) {
      categoryScores.coding.push(pct);
    } else if (cat.includes('dbms') || cat.includes('tech') || mod.includes('dbms') || mod.includes('technical')) {
      categoryScores.technical.push(pct);
    } else if (cat.includes('comm') || mod.includes('communication')) {
      categoryScores.communication.push(pct);
    } else if (cat.includes('interview') || mod.includes('hr')) {
      categoryScores.interview.push(pct);
    } else {
      categoryScores.technical.push(pct);
    }
  });

  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

  const breakdown = {
    aptitude: avg(categoryScores.aptitude),
    coding: avg(categoryScores.coding),
    technical: avg(categoryScores.technical),
    communication: avg(categoryScores.communication),
    interview: avg(categoryScores.interview),
  };

  const attemptCount = attempts.length;
  const overallAttemptAvg = attemptCount ? Math.round(attempts.reduce((a, b) => a + (b.percentage || 0), 0) / attemptCount) : 0;
  const roadmapScore = roadmap?.completionPercentage ?? 0;

  // Compute overall score consistent with the existing formula
  const calculatedScore = Math.round(
    overallAttemptAvg * READINESS_CONFIG.defaultWeights.assessment +
    roadmapScore * READINESS_CONFIG.defaultWeights.roadmap
  );

  return {
    score: calculatedScore,
    classification: classifyReadiness(calculatedScore),
    breakdown,
    attemptCount,
    overallAttemptAvg,
    roadmapScore,
    topicsCount: topics.length,
  };
}

export default {
  READINESS_CONFIG,
  classifyReadiness,
  getStudentReadinessBreakdown,
};
