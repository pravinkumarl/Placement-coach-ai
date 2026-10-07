import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import { gradeAttempt } from '../services/grading.service.js';
import { recordAttemptPerformance, recalculateReadiness } from '../services/performance.service.js';
import { ApiError, sendSuccess, asyncHandler } from '../utils/response.js';

const SENSITIVE_KEYS = ['correctKey', 'correctAnswer', 'expectedAnswer', 'solution'];

/**
 * Remove answer keys before questions are sent to the browser.
 */
export function stripAnswerKeys(questions = []) {
  return questions.map((question) => {
    const copy = { ...question };
    for (const key of SENSITIVE_KEYS) {
      if (key in copy) delete copy[key];
    }
    // MCQ `answer` may be an answer key ("a".."h") or option text;
    // only drop it when it looks like a key.
    if ('answer' in copy && typeof copy.answer === 'string' && /^[a-h]$/i.test(copy.answer.trim())) {
      delete copy.answer;
    }
    return copy;
  });
}

async function findAssessment(param) {
  const isObjectId = mongoose.Types.ObjectId.isValid(String(param));
  const assessment = isObjectId
    ? await Assessment.findById(param)
    : await Assessment.findOne({ moduleKey: String(param).toLowerCase() });
  if (!assessment) throw ApiError.notFound('Assessment not found.');
  return assessment;
}

/**
 * GET /api/assessments
 * List of assessment modules available to the signed in student.
 */
export const listAssessments = asyncHandler(async (req, res) => {
  const assessments = await Assessment.find({ isPublished: true })
    .select('moduleKey title category topic difficulty durationMinutes questionCount createdAt')
    .sort({ category: 1, title: 1 })
    .lean();

  const attempts = await AssessmentAttempt.find({
    userId: req.user._id,
    status: 'completed',
  })
    .select('assessmentId percentage completedAt')
    .sort('-completedAt')
    .lean();

  const latestByAssessment = new Map();
  for (const attempt of attempts) {
    const key = String(attempt.assessmentId || '');
    if (key && !latestByAssessment.has(key)) latestByAssessment.set(key, attempt);
  }

  const data = assessments.map((assessment) => {
    const latest = latestByAssessment.get(String(assessment._id));
    return {
      ...assessment,
      lastScore: latest ? latest.percentage : null,
      lastAttemptAt: latest ? latest.completedAt : null,
    };
  });

  return sendSuccess(res, { assessments: data });
});

/**
 * GET /api/assessments/:id
 * Full assessment including questions (answer keys stripped).
 */
export const getAssessment = asyncHandler(async (req, res) => {
  const assessment = await findAssessment(req.params.id);
  const payload = assessment.toObject();
  payload.questions = stripAnswerKeys(payload.questions || []);
  return sendSuccess(res, { assessment: payload });
});

/**
 * POST /api/assessments/:id/start
 * Records an in-progress attempt and returns the questions to render.
 */
export const startAssessment = asyncHandler(async (req, res) => {
  const assessment = await findAssessment(req.params.id);

  const attempt = await AssessmentAttempt.create({
    userId: req.user._id,
    assessmentId: assessment._id,
    moduleKey: assessment.moduleKey,
    title: assessment.title,
    category: assessment.category,
    status: 'in_progress',
    questionCount: (assessment.questions || []).length,
    totalQuestions: (assessment.questions || []).length,
    startedAt: new Date(),
  });

  return sendSuccess(
    res,
    {
      attemptId: attempt._id,
      assessment: {
        _id: assessment._id,
        moduleKey: assessment.moduleKey,
        title: assessment.title,
        category: assessment.category,
        durationMinutes: assessment.durationMinutes,
        questions: stripAnswerKeys(assessment.questions || []),
      },
    },
    'Assessment started.',
    201
  );
});

/**
 * POST /api/assessments/:id/submit
 * Server side grading — the client never decides the score.
 */
export const submitAssessment = asyncHandler(async (req, res) => {
  const assessment = await findAssessment(req.params.id);
  const { answers = [], attemptId, timeTakenSeconds = 0 } = req.body || {};

  if (!Array.isArray(answers)) {
    throw ApiError.badRequest('answers must be an array.');
  }

  let attempt = null;
  if (attemptId && mongoose.Types.ObjectId.isValid(String(attemptId))) {
    attempt = await AssessmentAttempt.findOne({
      _id: attemptId,
      userId: req.user._id,
      status: 'in_progress',
    });
  }
  if (!attempt) {
    attempt = await AssessmentAttempt.findOne({
      userId: req.user._id,
      assessmentId: assessment._id,
      status: 'in_progress',
    }).sort('-startedAt');
  }
  if (!attempt) {
    attempt = new AssessmentAttempt({
      userId: req.user._id,
      assessmentId: assessment._id,
      moduleKey: assessment.moduleKey,
      title: assessment.title,
      category: assessment.category,
      status: 'in_progress',
      startedAt: new Date(),
    });
  }

  const questions = assessment.questions || [];
  const graded = gradeAttempt(questions, answers);

  attempt.answers = graded.answers;
  attempt.topicResults = graded.topicResults;
  attempt.questionCount = graded.questionCount;
  attempt.totalQuestions = graded.questionCount;
  attempt.correctAnswers = graded.correctAnswers;
  attempt.score = graded.correctAnswers;
  attempt.percentage = graded.percentage;
  attempt.status = 'completed';
  attempt.completedAt = new Date();
  attempt.timeTakenSeconds = Math.max(0, Number(timeTakenSeconds) || 0);

  await attempt.save();

  await recordAttemptPerformance(req.user._id, attempt);

  const readiness = await recalculateReadiness(req.user._id);
  req.user.lastAssessmentAt = attempt.completedAt;
  req.user.readinessScore = readiness;

  return sendSuccess(
    res,
    {
      attempt: {
        _id: attempt._id,
        title: attempt.title,
        moduleKey: attempt.moduleKey,
        category: attempt.category,
        percentage: attempt.percentage,
        score: attempt.correctAnswers,
        questionCount: attempt.questionCount,
        topicResults: attempt.topicResults,
        completedAt: attempt.completedAt,
        timeTakenSeconds: attempt.timeTakenSeconds,
      },
      readinessScore: readiness,
    },
    'Assessment submitted and graded.'
  );
});

/**
 * GET /api/assessments/attempts
 * Attempt history (newest first).
 */
export const listAttempts = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const attempts = await AssessmentAttempt.find({
    userId: req.user._id,
    status: 'completed',
  })
    .sort('-completedAt')
    .limit(limit)
    .select(
      'title moduleKey category percentage score correctAnswers questionCount topicResults timeTakenSeconds completedAt'
    )
    .lean();

  return sendSuccess(res, { attempts });
});

/**
 * GET /api/assessments/stats
 * Aggregates for the performance page.
 */
export const getAssessmentStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const [overall, byCategory, timeline, total] = await Promise.all([
    AssessmentAttempt.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(String(userId)), status: 'completed' } },
      {
        $group: {
          _id: null,
          average: { $avg: '$percentage' },
          best: { $max: '$percentage' },
          count: { $sum: 1 },
          totalTime: { $sum: '$timeTakenSeconds' },
        },
      },
    ]),
    AssessmentAttempt.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(String(userId)), status: 'completed' } },
      {
        $group: {
          _id: '$category',
          average: { $avg: '$percentage' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    AssessmentAttempt.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(String(userId)), status: 'completed' } },
      { $sort: { completedAt: 1 } },
      { $limit: 50 },
      {
        $project: {
          _id: 0,
          title: 1,
          percentage: 1,
          completedAt: 1,
          category: 1,
        },
      },
    ]),
    AssessmentAttempt.countDocuments({ userId, status: 'completed' }),
  ]);

  const stats = overall[0] || {};

  return sendSuccess(res, {
    totalAssessments: total,
    averageScore: Math.round(stats.average || 0),
    bestScore: Math.round(stats.best || 0),
    totalTimeSeconds: Math.round(stats.totalTime || 0),
    byCategory: byCategory.map((row) => ({
      category: row._id || 'General',
      average: Math.round(row.average || 0),
      count: row.count,
    })),
    timeline,
  });
});

/**
 * GET /api/assessments/:id/results
 * Graded attempts for one module (newest first).
 */
export const getAssessmentResults = asyncHandler(async (req, res) => {
  const assessment = await findAssessment(req.params.id);
  const attempts = await AssessmentAttempt.find({
    userId: req.user._id,
    assessmentId: assessment._id,
    status: 'completed',
  })
    .sort('-completedAt')
    .limit(50)
    .select(
      'title moduleKey category percentage score correctAnswers questionCount topicResults timeTakenSeconds completedAt'
    )
    .lean();

  const total = attempts.length;
  const average = total
    ? Math.round(attempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / total)
    : 0;

  return sendSuccess(res, {
    assessment: {
      _id: assessment._id,
      moduleKey: assessment.moduleKey,
      title: assessment.title,
      category: assessment.category,
    },
    attempts,
    results: attempts,
    summary: {
      totalAttempts: total,
      averageScore: average,
      bestScore: attempts.reduce((best, a) => Math.max(best, a.percentage || 0), 0),
    },
  });
});

export default {
  listAssessments,
  getAssessment,
  startAssessment,
  submitAssessment,
  listAttempts,
  getAssessmentResults,
  getAssessmentStats,
};
