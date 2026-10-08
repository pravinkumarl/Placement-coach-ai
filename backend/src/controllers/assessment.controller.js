import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import CodingSubmission from '../models/CodingSubmission.js';
import Roadmap from '../models/Roadmap.js';
import { gradeAttempt } from '../services/grading.service.js';
import { recordAttemptPerformance, recalculateReadiness } from '../services/performance.service.js';
import { completeMilestoneForActivity } from '../services/roadmap.service.js';
import { enrichQuestion } from './code.controller.js';
import { ApiError, sendSuccess, asyncHandler } from '../utils/response.js';

const SENSITIVE_KEYS = [
  'correctKey',
  'correctAnswer',
  'expectedAnswer',
  'solution',
  'solutionCode',
  'hiddenTestCases',
  'expectedResult',
];

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
  const enriched = (payload.questions || []).map((q) => enrichQuestion(q, assessment.moduleKey));
  payload.questions = stripAnswerKeys(enriched);
  return sendSuccess(res, { assessment: payload });
});

/**
 * POST /api/assessments/:id/start
 * Records an in-progress attempt and returns the questions to render.
 */
export const startAssessment = asyncHandler(async (req, res) => {
  const assessment = await findAssessment(req.params.id);
  const roadmapId = req.body?.roadmapId || null;

  let roadmap = null;
  if (roadmapId && mongoose.Types.ObjectId.isValid(String(roadmapId))) {
    const found = await Roadmap.findOne({ _id: roadmapId, userId: req.user._id }).lean();
    if (found) roadmap = found;
  }

  const enriched = (assessment.questions || []).map((q) => enrichQuestion(q, assessment.moduleKey));

  const attempt = await AssessmentAttempt.create({
    userId: req.user._id,
    assessmentId: assessment._id,
    moduleKey: assessment.moduleKey,
    title: assessment.title,
    category: assessment.category,
    roadmapId: roadmap ? roadmap._id : null,
    status: 'in_progress',
    questionCount: enriched.length,
    totalQuestions: enriched.length,
    startedAt: new Date(),
  });

  return sendSuccess(
    res,
    {
      attemptId: attempt._id,
      roadmapId: attempt.roadmapId,
      assessment: {
        _id: assessment._id,
        moduleKey: assessment.moduleKey,
        title: assessment.title,
        category: assessment.category,
        durationMinutes: assessment.durationMinutes,
        questions: stripAnswerKeys(enriched),
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
  const { answers = [], attemptId, timeTakenSeconds = 0, roadmapId } = req.body || {};

  if (!Array.isArray(answers)) {
    throw ApiError.badRequest('answers must be an array.');
  }

  let attempt = null;
  if (attemptId !== undefined && attemptId !== null && String(attemptId).trim() !== '') {
    // An attemptId was supplied: it must be a valid id belonging to THIS user
    // and it must still be open. Anything else is rejected so one student can
    // never grade another student's attempt and duplicate submits cannot
    // silently create extra attempts.
    if (!mongoose.Types.ObjectId.isValid(String(attemptId))) {
      throw ApiError.badRequest('attemptId is not a valid id.');
    }
    attempt = await AssessmentAttempt.findOne({
      _id: attemptId,
      userId: req.user._id,
    });
    if (!attempt) {
      throw ApiError.notFound('Assessment attempt not found.');
    }
    if (String(attempt.assessmentId) !== String(assessment._id)) {
      throw ApiError.badRequest('This attempt does not belong to the requested assessment.');
    }
    if (attempt.status !== 'in_progress') {
      throw ApiError.conflict('This assessment attempt has already been submitted.');
    }
  } else {
    // No attemptId given: resume the student's own latest open attempt for
    // this module, or open one for them.
    attempt = await AssessmentAttempt.findOne({
      userId: req.user._id,
      assessmentId: assessment._id,
      status: 'in_progress',
    }).sort('-startedAt');
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
  }

  if (!attempt.roadmapId && roadmapId && mongoose.Types.ObjectId.isValid(String(roadmapId))) {
    const roadmap = await Roadmap.findOne({ _id: roadmapId, userId: req.user._id }).lean();
    if (roadmap) attempt.roadmapId = roadmap._id;
  }

  const questions = (assessment.questions || []).map((q) => enrichQuestion(q, assessment.moduleKey));

  // Code questions are scored from the student's persisted coding submissions
  // (server side Judge0 result), never from the raw textarea value alone.
  const codeQuestions = questions.filter((q) => String(q.type).toLowerCase() === 'code');
  const codeQuestionIds = codeQuestions.map((q) => String(q.id));

  const codeSubmissions = await CodingSubmission.find({
    userId: req.user._id,
    $or: [
      { attemptId: attempt._id },
      { assessmentId: assessment._id },
      { moduleKey: assessment.moduleKey },
    ],
    questionId: { $in: codeQuestionIds },
  })
    .sort({ createdAt: -1 })
    .lean();
  const submissionScores = new Map();
  for (const submission of codeSubmissions) {
    if (!submissionScores.has(submission.questionId)) {
      submissionScores.set(submission.questionId, submission.score);
    }
  }

  const graded = gradeAttempt(questions, answers, { submissionScores });

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

  // Completing the linked assessment completes the roadmap milestone.
  const completedMilestone = await completeMilestoneForActivity(
    req.user._id,
    assessment.moduleKey,
    attempt.roadmapId
  );

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
      completedMilestone: completedMilestone
        ? {
            _id: completedMilestone._id,
            title: completedMilestone.title,
            category: completedMilestone.category,
            status: completedMilestone.status,
            completedAt: completedMilestone.completedAt,
          }
        : null,
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
