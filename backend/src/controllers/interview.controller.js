import mongoose from 'mongoose';
import InterviewSession from '../models/InterviewSession.js';
import { createSession, evaluateAnswer } from '../services/interview.service.js';
import { ApiError, sendSuccess, asyncHandler } from '../utils/response.js';

function stripExpected(questions = []) {
  return questions.map((q) => ({
    id: q.id,
    category: q.category,
    question: q.question,
    difficulty: q.difficulty,
  }));
}

function sessionPayload(session, { includeAnswers = false } = {}) {
  const base = {
    _id: session._id,
    type: session.type,
    title: session.title,
    role: session.role,
    company: session.company,
    difficulty: session.difficulty,
    status: session.status,
    questionCount: session.questions.length,
    answers: session.answers,
    overallScore: session.overallScore,
    communicationScore: session.communicationScore,
    technicalScore: session.technicalScore,
    problemSolvingScore: session.problemSolvingScore,
    strengths: session.strengths,
    weaknesses: session.weaknesses,
    overallFeedback: session.overallFeedback,
    transcript: session.transcript,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
  };

  if (session.status === 'completed' || includeAnswers) {
    base.questions = session.questions;
    base.results = session.answers.map((answer) => {
      const question = session.questions.find((q) => q.id === answer.questionId);
      return {
        ...answer,
        question: question ? question.question : '',
        expectedAnswer: question ? question.expectedAnswer : '',
      };
    });
  } else {
    base.questions = stripExpected(session.questions);
  }

  return base;
}

async function findOwnSession(req) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw ApiError.badRequest('Invalid session id.');
  const session = await InterviewSession.findOne({ _id: id, userId: req.user._id });
  if (!session) throw ApiError.notFound('Interview session not found.');
  return session;
}

/**
 * POST /api/interviews
 */
export const createInterview = asyncHandler(async (req, res) => {
  const session = await createSession(req.user, req.body || {});
  return sendSuccess(res, { session: sessionPayload(session) }, 'Interview session created.', 201);
});

/**
 * GET /api/interviews
 */
export const listInterviews = asyncHandler(async (req, res) => {
  const sessions = await InterviewSession.find({ userId: req.user._id })
    .sort('-createdAt')
    .limit(30)
    .select(
      'type title role company difficulty status overallScore questionCount startedAt completedAt'
    )
    .lean();

  return sendSuccess(res, {
    interviews: sessions.map((s) => ({ ...s, questionCount: (s.questions || []).length || undefined })),
  });
});

/**
 * GET /api/interviews/:id
 */
export const getInterview = asyncHandler(async (req, res) => {
  const session = await findOwnSession(req);
  return sendSuccess(res, { session: sessionPayload(session, { includeAnswers: true }) });
});

/**
 * POST /api/interviews/:id/answers
 * Grade one answer: { questionId, answer }
 */
export const submitAnswer = asyncHandler(async (req, res) => {
  const session = await findOwnSession(req);
  if (session.status !== 'in_progress') {
    throw ApiError.badRequest('This interview session is already completed.');
  }

  const { questionId, answer } = req.body || {};
  const question = session.questions.find((q) => q.id === String(questionId || ''));
  if (!question) throw ApiError.badRequest('questionId does not belong to this session.');

  const { score, feedback } = await evaluateAnswer(question, answer);

  const existing = session.answers.find((a) => a.questionId === question.id);
  if (existing) {
    existing.answer = String(answer || '');
    existing.score = score;
    existing.feedback = feedback;
  } else {
    session.answers.push({ questionId: question.id, answer: String(answer || ''), score, feedback });
  }

  session.transcript.push({ role: 'user', content: String(answer || ''), at: new Date() });
  session.transcript.push({ role: 'assistant', content: feedback, at: new Date() });

  await session.save();

  const index = session.questions.findIndex((q) => q.id === question.id);
  const next = session.questions[index + 1] || null;

  return sendSuccess(res, {
    score,
    feedback,
    answeredCount: session.answers.length,
    totalQuestions: session.questions.length,
    nextQuestion: next
      ? { id: next.id, question: next.question, category: next.category, difficulty: next.difficulty }
      : null,
  });
});

/**
 * POST /api/interviews/:id/complete
 */
export const completeInterview = asyncHandler(async (req, res) => {
  const session = await findOwnSession(req);
  if (session.status === 'completed') {
    return sendSuccess(res, { session: sessionPayload(session, { includeAnswers: true }) });
  }

  session.status = 'completed';
  session.completedAt = new Date();

  const scored = session.answers.filter((a) => Number.isFinite(a.score));
  session.overallScore = scored.length
    ? Math.round(scored.reduce((sum, a) => sum + a.score, 0) / scored.length)
    : 0;

  applySubScores(session);

  const strong = session.answers.filter((a) => a.score >= 70);
  const weak = session.answers.filter((a) => a.score < 45);
  session.strengths = strong.map((a) => String(a.questionId || '').toUpperCase()).filter(Boolean);
  session.weaknesses = weak.map((a) => String(a.questionId || '').toUpperCase()).filter(Boolean);
  session.overallFeedback = buildOverallFeedback(session, strong, weak);

  session.transcript.push({
    role: 'system',
    content: `Interview completed. Overall score: ${session.overallScore}/100.`,
    at: new Date(),
  });

  await session.save();
  return sendSuccess(res, { session: sessionPayload(session, { includeAnswers: true }) }, 'Interview completed.');
});

/**
 * DELETE /api/interviews/:id
 */
export const deleteInterview = asyncHandler(async (req, res) => {
  const session = await findOwnSession(req);
  await session.deleteOne();
  return sendSuccess(res, null, 'Interview session deleted.');
});

const SUB_SCORE_CATEGORIES = {
  technical: ['dsa', 'dbms', 'networking', 'design', 'project', 'problem-solving'],
  problemSolving: ['problem-solving', 'design', 'prioritisation', 'planning', 'initiative', 'ownership'],
  communication: ['intro', 'motivation', 'self-awareness', 'goals', 'teamwork', 'conflict', 'growth', 'pitch', 'closing'],
};

/**
 * Compute communication / technical / problem-solving sub-scores by grouping
 * each answer's question category. Categories outside every group fall back to
 * the overall score.
 */
function applySubScores(session) {
  const answers = session.answers.filter((a) => Number.isFinite(a.score));
  if (answers.length === 0) {
    session.communicationScore = 0;
    session.technicalScore = 0;
    session.problemSolvingScore = 0;
    return;
  }

  const groups = { communication: [], technical: [], problemSolving: [] };
  for (const answer of answers) {
    const question = session.questions.find((q) => q.id === answer.questionId);
    const category = String(question?.category || '').toLowerCase().trim();
    if (SUB_SCORE_CATEGORIES.communication.includes(category)) groups.communication.push(answer);
    if (SUB_SCORE_CATEGORIES.technical.includes(category)) groups.technical.push(answer);
    if (SUB_SCORE_CATEGORIES.problemSolving.includes(category)) groups.problemSolving.push(answer);
  }

  const averageOf = (list) =>
    list.length ? Math.round(list.reduce((sum, a) => sum + a.score, 0) / list.length) : session.overallScore;

  session.communicationScore = averageOf(groups.communication);
  session.technicalScore = averageOf(groups.technical);
  session.problemSolvingScore = averageOf(groups.problemSolving);
}

function buildOverallFeedback(session, strong, weak) {
  if (session.answers.length === 0) {
    return 'No answers were submitted, so no score could be calculated.';
  }
  const parts = [
    `You answered ${session.answers.length} of ${session.questions.length} questions for the ${session.type} interview.`,
  ];
  if (strong.length > 0) {
    parts.push(`Strong answers: ${strong.map((a) => a.questionId.toUpperCase()).join(', ')}.`);
  }
  if (weak.length > 0) {
    parts.push(
      `Focus areas: ${weak
        .map((a) => a.questionId.toUpperCase())
        .join(', ')} — add structure (STAR) and concrete examples.`
    );
  }
  parts.push(
    session.overallScore >= 70
      ? 'Overall performance is solid — keep practising with harder questions.'
      : 'Keep practising. Record yourself answering aloud and tighten every answer to under two minutes.'
  );
  return parts.join(' ');
}

export default {
  createInterview,
  listInterviews,
  getInterview,
  submitAnswer,
  completeInterview,
  deleteInterview,
};
