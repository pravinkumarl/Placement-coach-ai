/**
 * Grading service — server side single source of truth for scores.
 *
 * Rules (consistent across the whole platform):
 *  - mcq:        graded against the stored `correctKey`
 *  - code:       graded from the persisted coding submission when available
 *                (perfect = 100), otherwise on non-empty source
 *  - sql/others: graded on non-empty answer (no judge available offline)
 *  - percentage = correct / total * 100
 */

function isEmptyAnswer(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Grade a single question.
 * @param {object} question
 * @param {*} answer  raw answer from the client
 * @param {object} [context]  { submissionScore?: number|null }
 * @returns {{isCorrect: boolean, correctValue: *}}
 */
export function gradeQuestion(question, answer, context = {}) {
  const type = String(question.type || question.kind || 'mcq').toLowerCase();

  if (type === 'mcq' || type === 'multi' || question.options) {
    const expected = question.correctKey ?? question.answer ?? question.correctAnswer;
    const given = typeof answer === 'string' ? answer.trim() : answer;
    return {
      isCorrect: typeof expected === 'string' && typeof given === 'string'
        ? given.toLowerCase() === expected.toLowerCase()
        : given === expected,
      correctValue: expected,
    };
  }

  if (type === 'code') {
    const submissionScore = context.submissionScore;
    if (submissionScore === undefined || submissionScore === null) {
      return { isCorrect: !isEmptyAnswer(answer), correctValue: null };
    }
    return { isCorrect: Number(submissionScore) >= 70, correctValue: null };
  }

  const correct = !isEmptyAnswer(answer);
  return { isCorrect: correct, correctValue: null };
}

/**
 * Grade a full attempt.
 * @param {Array<object>} questions     questions served to the student
 * @param {Array<{questionId: string, value: *}>} answers  student answers
 * @param {object} [options]            { submissionScores?: Map<string,number> }
 * @returns {{
 *   answers: Array<object>,
 *   topicResults: Array<object>,
 *   questionCount: number,
 *   correctAnswers: number,
 *   percentage: number
 * }}
 */
export function gradeAttempt(questions = [], answers = [], options = {}) {
  const answerMap = new Map();
  for (const entry of answers) {
    if (entry && entry.questionId !== undefined && entry.questionId !== null) {
      answerMap.set(String(entry.questionId), entry.value);
    }
  }

  const submissionScores = options.submissionScores instanceof Map ? options.submissionScores : null;
  const topicBuckets = new Map();
  const graded = [];
  let correctAnswers = 0;

  for (const question of questions) {
    const questionId = String(question.id ?? question._id ?? '');
    const value = answerMap.has(questionId) ? answerMap.get(questionId) : undefined;
    const submissionScore = submissionScores ? submissionScores.get(questionId) : undefined;
    const { isCorrect } = gradeQuestion(question, value, { submissionScore });

    if (isCorrect) correctAnswers += 1;

    graded.push({
      questionId,
      topic: question.topic || '',
      type: String(question.type || '').toLowerCase(),
      value: value ?? null,
      isCorrect,
    });

    const key = question.topic || 'General';
    if (!topicBuckets.has(key)) {
      topicBuckets.set(key, {
        topic: key,
        category: question.category || '',
        correct: 0,
        total: 0,
      });
    }
    const bucket = topicBuckets.get(key);
    bucket.total += 1;
    if (isCorrect) bucket.correct += 1;
  }

  const topicResults = [...topicBuckets.values()].map((bucket) => ({
    ...bucket,
    percentage: bucket.total ? Math.round((bucket.correct / bucket.total) * 100) : 0,
  }));

  const questionCount = questions.length;
  const percentage = questionCount
    ? Math.round((correctAnswers / questionCount) * 100)
    : 0;

  return {
    answers: graded,
    topicResults,
    questionCount,
    correctAnswers,
    percentage,
  };
}

export default { gradeQuestion, gradeAttempt };
