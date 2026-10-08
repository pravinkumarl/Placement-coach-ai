import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import AssessmentAttempt from '../models/AssessmentAttempt.js';
import CodingSubmission from '../models/CodingSubmission.js';
import Roadmap from '../models/Roadmap.js';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_KEYS,
  MAX_SOURCE_CHARS,
  buildProgram,
  executeCode,
  runTestCases,
  normalizeOutput,
} from '../services/codeExecution.service.js';
import {
  completeMilestoneForActivity,
  mapCategoryToModule,
} from '../services/roadmap.service.js';
import { recalculateReadiness } from '../services/performance.service.js';
import { ASSESSMENT_MODULES } from '../data/assessmentBank.js';
import { ApiError, sendSuccess, asyncHandler } from '../utils/response.js';

export function enrichQuestion(question, moduleKey) {
  if (!question) return question;
  for (const mod of Object.values(ASSESSMENT_MODULES)) {
    const found = (mod.questions || []).find((q) => String(q.id) === String(question.id));
    if (found) {
      return {
        ...found,
        ...question,
        sampleTestCases: (Array.isArray(question.sampleTestCases) && question.sampleTestCases.length > 0)
          ? question.sampleTestCases
          : (found.sampleTestCases || []),
        hiddenTestCases: (Array.isArray(question.hiddenTestCases) && question.hiddenTestCases.length > 0)
          ? question.hiddenTestCases
          : (found.hiddenTestCases || []),
        supportedLanguages: (Array.isArray(question.supportedLanguages) && question.supportedLanguages.length > 0)
          ? question.supportedLanguages
          : (found.supportedLanguages || LANGUAGE_KEYS),
        starterTemplates: {
          ...(found.starterTemplates || {}),
          ...(question.starterTemplates || {}),
        },
      };
    }
  }
  return question;
}

/**
 * Find the assessment that owns a question and return the question itself.
 */
async function findQuestion(questionId, moduleKey) {
  const query = { 'questions.id': String(questionId), isPublished: true };
  const assessment = moduleKey
    ? await Assessment.findOne({ ...query, moduleKey: String(moduleKey).toLowerCase() }).lean()
    : await Assessment.findOne(query).lean();
  if (!assessment) throw ApiError.notFound('Coding question not found.');
  const rawQuestion = (assessment.questions || []).find((q) => String(q.id) === String(questionId));
  if (!rawQuestion) throw ApiError.notFound('Coding question not found.');
  const question = enrichQuestion(rawQuestion, assessment.moduleKey);
  return { assessment, question };
}

function assertLanguage(language) {
  if (!SUPPORTED_LANGUAGES[language]) {
    throw ApiError.badRequest('Unsupported language. Use one of: ' + LANGUAGE_KEYS.join(', ') + '.');
  }
}

function assertQuestionSupports(question, language) {
  const supported = Array.isArray(question.supportedLanguages)
    ? question.supportedLanguages
    : LANGUAGE_KEYS;
  if (!supported.includes(language)) {
    throw ApiError.badRequest(`This question does not support ${language}.`);
  }
}

/**
 * GET /api/code/languages
 * Languages available for the coding editor (stable across providers).
 */
export const listLanguages = asyncHandler(async (req, res) => {
  const languages = LANGUAGE_KEYS.map((key) => ({
    key,
    label: SUPPORTED_LANGUAGES[key].label,
    short: SUPPORTED_LANGUAGES[key].short,
  }));
  return sendSuccess(res, { languages, maxSourceChars: MAX_SOURCE_CHARS });
});

/**
 * POST /api/code/execute
 * Raw sandbox run — no question is attached. Body: { language, sourceCode, stdin? }
 */
export const executeProgram = asyncHandler(async (req, res) => {
  const { language, sourceCode, stdin = '' } = req.body || {};
  assertLanguage(language);

  const source = String(sourceCode || '');
  if (!source.trim()) throw ApiError.badRequest('sourceCode is required.');
  if (source.length > MAX_SOURCE_CHARS) {
    throw ApiError.badRequest(`sourceCode must be at most ${MAX_SOURCE_CHARS} characters.`);
  }
  if (String(stdin).length > MAX_SOURCE_CHARS) {
    throw ApiError.badRequest(`stdin must be at most ${MAX_SOURCE_CHARS} characters.`);
  }

  const result = await executeCode({ language, sourceCode: source, stdin: String(stdin) });

  return sendSuccess(res, {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    compileOutput: result.compileOutput,
    time: result.time,
    memory: result.memory,
  });
});

/**
 * POST /api/code/run
 * Runs the candidate's source against the question's PUBLIC sample cases.
 * Nothing is persisted. Body: { questionId, moduleKey?, language, sourceCode, attemptId? }
 */
export const runCode = asyncHandler(async (req, res) => {
  const { questionId, moduleKey, language, sourceCode, attemptId } = req.body || {};
  if (questionId === undefined || questionId === null || String(questionId).trim() === '') {
    throw ApiError.badRequest('questionId is required.');
  }
  assertLanguage(language);

  const { assessment, question } = await findQuestion(questionId, moduleKey);
  assertQuestionSupports(question, language);

  const source = String(sourceCode || '');
  if (!source.trim()) throw ApiError.badRequest('sourceCode is required.');
  if (source.length > MAX_SOURCE_CHARS) {
    throw ApiError.badRequest(`sourceCode must be at most ${MAX_SOURCE_CHARS} characters.`);
  }

  const testCases = Array.isArray(question.sampleTestCases) ? question.sampleTestCases : [];
  const run = await runTestCases(question, language, source, testCases);

  return sendSuccess(res, {
    questionId: String(question.id),
    moduleKey: assessment.moduleKey,
    language,
    status: run.status,
    passedTests: run.passedTests,
    totalTests: run.totalTests,
    score: run.score,
    results: run.results.map((r) => ({
      passed: r.passed,
      status: r.status,
      input: r.input,
      expectedOutput: r.expectedOutput,
      actualOutput: r.actualOutput,
      time: r.time,
      stderr: r.stderr,
    })),
    compileOutput: run.compileOutput,
    executionTime: run.executionTime,
    memory: run.memory,
  });
});

async function resolveAttempt(userId, assessment, attemptId) {
  if (attemptId !== undefined && attemptId !== null && String(attemptId).trim() !== '') {
    if (!mongoose.Types.ObjectId.isValid(String(attemptId))) {
      throw ApiError.badRequest('attemptId is not a valid id.');
    }
    const attempt = await AssessmentAttempt.findOne({
      _id: attemptId,
      userId,
    });
    if (!attempt) throw ApiError.notFound('Assessment attempt not found.');
    if (String(attempt.assessmentId) !== String(assessment._id)) {
      throw ApiError.badRequest('This attempt does not belong to the requested assessment.');
    }
    return attempt;
  }
  return await AssessmentAttempt.findOne({
    userId,
    assessmentId: assessment._id,
    status: 'in_progress',
  }).sort('-startedAt');
}

/**
 * POST /api/code/submit
 * Runs the candidate's source against HIDDEN cases, persists the submission,
 * and (on a perfect score) completes the linked roadmap milestone.
 */
export const submitCode = asyncHandler(async (req, res) => {
  const {
    questionId,
    moduleKey,
    language,
    sourceCode,
    attemptId,
    roadmapId,
    assessmentId,
  } = req.body || {};
  if (questionId === undefined || questionId === null || String(questionId).trim() === '') {
    throw ApiError.badRequest('questionId is required.');
  }
  assertLanguage(language);

  const { assessment, question } = await findQuestion(questionId, moduleKey);
  assertQuestionSupports(question, language);

  const source = String(sourceCode || '');
  if (!source.trim()) throw ApiError.badRequest('sourceCode is required.');
  if (source.length > MAX_SOURCE_CHARS) {
    throw ApiError.badRequest(`sourceCode must be at most ${MAX_SOURCE_CHARS} characters.`);
  }

  const attempt = await resolveAttempt(req.user._id, assessment, attemptId);

  const testCases = Array.isArray(question.hiddenTestCases) ? question.hiddenTestCases : [];
  const run = await runTestCases(question, language, source, testCases);

  const submission = await CodingSubmission.create({
    userId: req.user._id,
    attemptId: attempt ? attempt._id : null,
    assessmentId: assessment._id,
    moduleKey: assessment.moduleKey,
    roadmapId: roadmapId || null,
    questionId: String(question.id),
    questionTitle: question.title || '',
    topic: question.topic || '',
    language,
    sourceCode: source,
    status: run.status,
    passedTests: run.passedTests,
    totalTests: run.totalTests,
    score: run.score,
    compileOutput: run.compileOutput,
    stderr: run.stderr,
    executionTime: run.executionTime,
    memory: run.memory,
  });

  let readinessScore = req.user.readinessScore ?? 0;
  let completedMilestone = null;

  if (run.score === 100) {
    completedMilestone = await completeMilestoneForActivity(
      req.user._id,
      assessment.moduleKey,
      roadmapId || null
    );
    readinessScore = await recalculateReadiness(req.user._id);
    req.user.readinessScore = readinessScore;
  }

  return sendSuccess(
    res,
    {
      submission: {
        _id: submission._id,
        questionId: String(question.id),
        language,
        status: submission.status,
        passedTests: submission.passedTests,
        totalTests: submission.totalTests,
        score: submission.score,
        executionTime: submission.executionTime,
        memory: submission.memory,
        submittedAt: submission.createdAt,
      },
      results: run.results.map((r) => ({
        passed: r.passed,
        status: r.status,
        time: r.time,
      })),
      readinessScore,
      completedMilestone: completedMilestone
        ? {
            _id: completedMilestone._id,
            title: completedMilestone.title,
            category: completedMilestone.category,
            status: completedMilestone.status,
            completedAt: completedMilestone.completedAt,
          }
        : null,
    },
    run.score === 100 ? 'All hidden test cases passed.' : 'Submission graded.'
  );
});

export default { listLanguages, executeProgram, runCode, submitCode };