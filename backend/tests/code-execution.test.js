import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getApp, startTestDb, stopTestDb, resetDb, registerUser } from './setup.js';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_KEYS,
  buildProgram,
  executeCode,
  normalizeOutput,
} from '../src/services/codeExecution.service.js';
import { ASSESSMENT_MODULES } from '../src/data/assessmentBank.js';

let app;
let token;

before(async () => {
  await startTestDb();
  app = await getApp();
  await resetDb({ seedAssessments: true });
  const session = await registerUser(request(app));
  token = session.token;
});

after(async () => {
  await stopTestDb();
});

const auth = (r) => r.set('Authorization', `Bearer ${token}`);

function questionById(id) {
  for (const module of Object.values(ASSESSMENT_MODULES)) {
    const found = (module.questions || []).find((q) => String(q.id) === id);
    if (found) return found;
  }
  return null;
}

async function judgeAvailable() {
  try {
    const res = await executeCode({
      language: 'python',
      sourceCode: 'print(42)',
      stdin: '',
    });
    return res.status === 'Accepted' && normalizeOutput(res.stdout) === '42';
  } catch {
    return false;
  }
}

describe('harness generation (unit, offline)', () => {
  test('buildProgram embeds the student source for every supported language', () => {
    const twoSum = questionById('code-1');
    assert.ok(twoSum, 'code-1 exists in the bank');
    assert.ok(twoSum.entryFunction, 'entryFunction defined');
    assert.ok(Array.isArray(twoSum.paramTypes) && twoSum.paramTypes.length >= 1);
    assert.ok(Array.isArray(twoSum.sampleTestCases) && twoSum.sampleTestCases.length >= 1);
    assert.ok(Array.isArray(twoSum.hiddenTestCases) && twoSum.hiddenTestCases.length >= 1);
    assert.ok(twoSum.solutionCode && typeof twoSum.solutionCode.python === 'string');

    for (const language of twoSum.supportedLanguages || LANGUAGE_KEYS) {
      const source = twoSum.starterTemplates[language];
      assert.ok(source, `starter template exists for ${language}`);
      const program = buildProgram(twoSum, language, source);
      assert.equal(typeof program, 'string');
      assert.ok(program.includes(source), `program embeds source for ${language}`);
      assert.ok(program.length > source.length, `harness appended for ${language}`);
    }
  });

  test('every starter template is a clean skeleton (no leaked solution)', () => {
    for (const [moduleKey, module] of Object.entries(ASSESSMENT_MODULES)) {
      if (moduleKey !== 'coding') continue;
      for (const q of module.questions || []) {
        for (const [language, source] of Object.entries(q.starterTemplates || {})) {
          assert.ok(source.length < 600, `${q.id} ${language} skeleton is short`);
          assert.doesNotMatch(
            source,
            /lookup\s*=|dp\s*=\s*\[/,
            `${q.id} ${language} must not contain a solution fragment`
          );
        }
      }
    }
  });

  test('C starter matches the harness calling convention for int[] returns', () => {
    const twoSum = questionById('code-1');
    const program = buildProgram(twoSum, 'c', twoSum.starterTemplates.c);
    assert.match(program, /int\* twoSum\(int\* nums, int numsSize, int target, int\* returnSize\)/);
    assert.match(program, /twoSum\(_a0, _n0, _a1, &_rsz\)/);
  });

  test('tree question is only supported in languages with a tree runtime', () => {
    const bst = questionById('code-3');
    assert.ok(bst);
    assert.deepEqual(
      (bst.supportedLanguages || []).slice().sort(),
      ['cpp', 'java', 'javascript', 'python']
    );
    for (const language of bst.supportedLanguages) {
      const program = buildProgram(bst, language, bst.starterTemplates[language]);
      assert.ok(program.length > 20);
    }
  });

  test('unsupported language and non-executable questions throw typed errors', () => {
    const twoSum = questionById('code-1');
    assert.throws(
      () => buildProgram(twoSum, 'brainfuck', 'x'),
      (err) => err.code === 'UNSUPPORTED_LANGUAGE'
    );

    assert.throws(
      () => buildProgram({ id: 'x', type: 'mcq', options: [] }, 'python', 'y'),
      (err) => err.code === 'QUESTION_NOT_EXECUTABLE'
    );
  });
});

describe('GET /api/code/languages', () => {
  test('lists each supported language without leaking provider ids', async () => {
    const res = await auth(request(app).get('/api/code/languages'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const languages = res.body.data.languages;
    assert.ok(Array.isArray(languages));
    assert.equal(languages.length, Object.keys(SUPPORTED_LANGUAGES).length);
    for (const lang of languages) {
      assert.ok(lang.key, 'language key present');
      assert.ok(lang.label, 'language label present');
      assert.ok(!('judge0' in lang) && !('language_id' in lang), 'no provider id leaked');
    }
    assert.equal(typeof res.body.data.maxSourceChars, 'number');
  });

  test('rejects anonymous callers', async () => {
    const res = await request(app).get('/api/code/languages');
    assert.equal(res.status, 401);
  });
});

describe('POST /api/code/execute and /run validation', () => {
  test('execute rejects missing/empty source and unknown language', async () => {
    const missing = await auth(request(app).post('/api/code/execute')).send({ language: 'python' });
    assert.equal(missing.status, 400);

    const empty = await auth(request(app).post('/api/code/execute')).send({ language: 'python', sourceCode: '   ' });
    assert.equal(empty.status, 400);

    const badLang = await auth(request(app).post('/api/code/execute')).send({
      language: 'cobol',
      sourceCode: 'x',
    });
    assert.equal(badLang.status, 400);
    assert.match(badLang.body.message, /Unsupported language/i);
  });

  test('run rejects a missing questionId, empty source and unsupported language', async () => {
    const noQuestion = await auth(request(app).post('/api/code/run')).send({
      language: 'python',
      sourceCode: 'def twoSum(nums, target):\n    pass',
    });
    assert.equal(noQuestion.status, 400);
    assert.match(noQuestion.body.message, /questionId/i);

    const noSource = await auth(request(app).post('/api/code/run')).send({
      questionId: 'code-1',
      language: 'python',
      sourceCode: '   ',
    });
    assert.equal(noSource.status, 400);

    const unsupported = await auth(request(app).post('/api/code/run')).send({
      questionId: 'code-3',
      language: 'c',
    });
    assert.equal(unsupported.status, 400);
  });

  test('run returns 404 for an unknown questionId', async () => {
    const res = await auth(request(app).post('/api/code/run')).send({
      questionId: 'code-999',
      language: 'python',
      sourceCode: 'x',
    });
    assert.equal(res.status, 404);
  });

  test('submit requires questionId and a supported language', async () => {
    const res = await auth(request(app).post('/api/code/submit')).send({
      language: 'ruby',
      sourceCode: 'x',
      questionId: 'code-1',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Unsupported language/i);
  });
});

describe('live Judge0 execution', () => {
  test('the provider is reachable (probe)', async (t) => {
    const available = await judgeAvailable();
    if (!available) {
      t.skip('Judge0 provider unavailable in this environment');
      return;
    }
  });

  test('runs a correct solution across several languages', async (t) => {
    if (!(await judgeAvailable())) {
      t.skip('Judge0 provider unavailable — skipped live language matrix');
      return;
    }

    const twoSum = questionById('code-1');
    const solution = `def twoSum(nums, target):
    lookup = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in lookup:
            return [lookup[complement], i]
        lookup[num] = i
    return []`;

    const res = await auth(request(app).post('/api/code/run')).send({
      questionId: 'code-1',
      moduleKey: 'coding',
      language: 'python',
      sourceCode: solution,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'Accepted');
    assert.equal(res.body.data.passedTests, res.body.data.totalTests);
    assert.ok(res.body.data.totalTests >= 2);
    assert.equal(res.body.data.score, 100);
  });

  test('hidden test results returned by submit never leak expected outputs', async (t) => {
    if (!(await judgeAvailable())) {
      t.skip('Judge0 provider unavailable — skipped submit leak check');
      return;
    }

    const solution = `def twoSum(nums, target):
    lookup = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in lookup:
            return [lookup[complement], i]
        lookup[num] = i
    return []`;

    const res = await auth(request(app).post('/api/code/submit')).send({
      questionId: 'code-1',
      moduleKey: 'coding',
      language: 'python',
      sourceCode: solution,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const body = JSON.stringify(res.body);
    assert.ok(!body.includes('expectedOutput'), 'hidden expected outputs not leaked');
    assert.ok(!body.includes('SecondHighestSalary'), 'sql expected result not leaked');
    assert.equal(res.body.data.submission.score, 100);
    assert.ok(Array.isArray(res.body.data.results));
    for (const result of res.body.data.results) {
      assert.ok('passed' in result);
      assert.ok('status' in result);
    }
  });
});

describe('assessment payload does not leak solutions', () => {
  test('coding assessment questions never contain hidden cases or solution code', async () => {
    const res = await auth(request(app).get('/api/assessments/coding'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const body = JSON.stringify(res.body);

    assert.ok(!body.includes('hiddenTestCases'), 'hidden cases stripped');
    assert.ok(!body.includes('solutionCode'), 'solution code stripped');
    assert.match(body, /sampleTestCases/, 'sample cases stay for the Run button');
    assert.match(body, /entryFunction/);
    assert.match(body, /starterTemplates/);
  });

  test('sql assessments strip the expected results from the browser', async () => {
    const res = await auth(request(app).get('/api/assessments/dbms'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(!JSON.stringify(res.body).includes('expectedResult'));
    assert.ok(!JSON.stringify(res.body).includes('SecondHighestSalary'));
  });
});