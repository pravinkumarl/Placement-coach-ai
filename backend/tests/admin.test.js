import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { startTestDb, stopTestDb, resetDb, getApp, registerUser } from './setup.js';
import User from '../src/models/User.js';
import { hashPassword } from '../src/utils/password.js';
import { signToken } from '../src/utils/jwt.js';

let app;
let request;

before(async () => {
  await startTestDb();
  app = await getApp();
  request = supertest(app);
});

after(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await resetDb({ seedAssessments: true });
});

async function createAdminUser() {
  const admin = await User.create({
    name: 'TPO Placement Admin',
    email: `admin-${Date.now()}@placement.edu`,
    passwordHash: await hashPassword('AdminPass123'),
    role: 'admin',
    college: 'Test College of Engineering',
  });

  return {
    user: admin.toSafeJSON(),
    token: signToken(admin._id, 'admin'),
  };
}

test('RBAC — /api/admin access authorization', async (t) => {
  await t.test('anonymous caller is rejected with 401', async () => {
    const res = await request.get('/api/admin/overview');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  await t.test('student caller is rejected with 403 Forbidden', async () => {
    const student = await registerUser(request);
    const res = await request
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${student.token}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Administrator privileges required/i);
  });

  await t.test('admin caller is allowed to access /api/admin/overview', async () => {
    const admin = await createAdminUser();
    const res = await request
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${admin.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.kpis);
    assert.ok(typeof res.body.data.kpis.totalStudents === 'number');
  });
});

test('Student directory and drill-down', async (t) => {
  await t.test('lists students with pagination and tier classification', async () => {
    const admin = await createAdminUser();
    await registerUser(request, { name: 'Student Alpha', branch: 'CSE' });
    await registerUser(request, { name: 'Student Beta', branch: 'IT' });

    const res = await request
      .get('/api/admin/students?page=1&limit=10')
      .set('Authorization', `Bearer ${admin.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.students));
    assert.equal(res.body.data.students.length, 2);
    assert.equal(res.body.data.pagination.total, 2);
    assert.ok(res.body.data.students[0].tier);
  });

  await t.test('drills down into a student profile with categories breakdown', async () => {
    const admin = await createAdminUser();
    const student = await registerUser(request, { name: 'Student Deep' });

    const res = await request
      .get(`/api/admin/students/${student.user._id}`)
      .set('Authorization', `Bearer ${admin.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.student.name, 'Student Deep');
    assert.ok(res.body.data.readiness);
    assert.ok(res.body.data.readiness.breakdown);
  });

  await t.test('updates student placement status', async () => {
    const admin = await createAdminUser();
    const student = await registerUser(request);

    const res = await request
      .patch(`/api/admin/students/${student.user._id}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ placementStatus: 'placed', backlogs: 0 });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.student.placementStatus, 'placed');
  });
});

test('Batch analytics and eligibility screening', async (t) => {
  await t.test('calculates batch analytics and returns recommendations', async () => {
    const admin = await createAdminUser();
    const res = await request
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${admin.token}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.aiInsight);
    assert.ok(Array.isArray(res.body.data.weakestTopics));
  });

  await t.test('screens students by eligibility criteria', async () => {
    const admin = await createAdminUser();
    await registerUser(request, { name: 'Eligible Candidate', branch: 'CSE' });

    const res = await request
      .get('/api/admin/eligibility?minCgpa=0&minReadiness=0&branches=CSE')
      .set('Authorization', `Bearer ${admin.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.eligibleCount, 1);
    assert.equal(res.body.data.students[0].name, 'Eligible Candidate');
  });
});

test('Placement drives and applications lifecycle', async (t) => {
  await t.test('admin creates drive, student applies, admin updates stage', async () => {
    const admin = await createAdminUser();
    const student = await registerUser(request, { name: 'Job Seeker', branch: 'CSE' });

    // 1. Admin creates drive
    const driveRes = await request
      .post('/api/admin/drives')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        company: 'Google',
        role: 'SDE-1',
        package: '25 LPA',
        minCgpa: 7.0,
        minReadiness: 50,
        eligibleBranches: ['CSE', 'IT'],
        description: 'Annual campus hiring.',
      });

    assert.equal(driveRes.status, 201);
    const driveId = driveRes.body.data.drive._id;

    // 2. Student lists open drives
    const listRes = await request
      .get('/api/drives')
      .set('Authorization', `Bearer ${student.token}`);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.drives.length, 1);
    assert.equal(listRes.body.data.drives[0].company, 'Google');

    // 3. Student applies
    const applyRes = await request
      .post(`/api/drives/${driveId}/apply`)
      .set('Authorization', `Bearer ${student.token}`);

    assert.equal(applyRes.status, 201);
    const applicationId = applyRes.body.data.application._id;

    // 4. Admin inspects applications pipeline
    const appsRes = await request
      .get('/api/admin/applications')
      .set('Authorization', `Bearer ${admin.token}`);

    assert.equal(appsRes.status, 200);
    assert.equal(appsRes.body.data.applications.length, 1);
    assert.equal(appsRes.body.data.applications[0].status, 'Applied');

    // 5. Admin advances stage to Shortlisted
    const updateRes = await request
      .patch(`/api/admin/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'Shortlisted', stageNotes: 'Cleared resume screen' });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.application.status, 'Shortlisted');
  });
});

test('Assessments and Question Bank CRUD', async (t) => {
  await t.test('admin creates and toggles an assessment', async () => {
    const admin = await createAdminUser();

    const createRes = await request
      .post('/api/admin/assessments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: 'Cloud Architecture & DevOps',
        moduleKey: 'cloud-devops',
        category: 'Technical Core',
        difficulty: 'Medium',
        durationMinutes: 60,
      });

    assert.equal(createRes.status, 201);
    const id = createRes.body.data.assessment._id;

    const toggleRes = await request
      .patch(`/api/admin/assessments/${id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);

    assert.equal(toggleRes.status, 200);
    assert.equal(toggleRes.body.data.isPublished, false);
  });

  await t.test('admin adds a question to the bank', async () => {
    const admin = await createAdminUser();

    const qRes = await request
      .post('/api/admin/questions')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: 'Q1: CAP Theorem',
        question: 'Which of the following describes the C in CAP theorem?',
        type: 'mcq',
        category: 'Database Systems',
        topic: 'Distributed Systems',
        difficulty: 'Medium',
        options: [
          { key: 'A', text: 'Consistency' },
          { key: 'B', text: 'Concurrency' },
        ],
        correctKey: 'A',
      });

    assert.equal(qRes.status, 201);
    assert.equal(qRes.body.data.question.topic, 'Distributed Systems');
  });
});

test('Audit logs', async (t) => {
  await t.test('records admin actions in system audit logs', async () => {
    const admin = await createAdminUser();

    // Trigger an administrative action
    await request
      .post('/api/admin/notifications')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: 'Notice for batch 2026',
        message: 'Mock tests commence on Monday.',
      });

    const logsRes = await request
      .get('/api/admin/logs')
      .set('Authorization', `Bearer ${admin.token}`);

    assert.equal(logsRes.status, 200);
    assert.ok(logsRes.body.data.logs.length > 0);
    assert.equal(logsRes.body.data.logs[0].action, 'CREATE_NOTIFICATION');
  });
});
