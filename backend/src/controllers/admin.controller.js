import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import Question from '../models/Question.js';
import PlacementDrive from '../models/PlacementDrive.js';
import DriveApplication from '../models/DriveApplication.js';
import Notification from '../models/Notification.js';
import AdminLog from '../models/AdminLog.js';
import User from '../models/User.js';
import TopicPerformance from '../models/TopicPerformance.js';
import { ApiError, sendSuccess, asyncHandler } from '../utils/response.js';
import adminService, {
  logAdminAction,
  getAdminOverview,
  getStudentDirectory,
  getStudentDrillDown,
  getBatchWeaknessAnalytics,
  screenEligibleStudents,
  generateStudentsCsv,
  importStudentsFromCsv,
} from '../services/admin.service.js';

/**
 * GET /api/admin/overview
 */
export const getOverview = asyncHandler(async (req, res) => {
  const data = await getAdminOverview();
  return sendSuccess(res, data);
});

/**
 * GET /api/admin/students
 */
export const listStudents = asyncHandler(async (req, res) => {
  const result = await getStudentDirectory(req.query);
  return sendSuccess(res, result);
});

/**
 * GET /api/admin/students/:id
 */
export const getStudent = asyncHandler(async (req, res) => {
  const data = await getStudentDrillDown(req.params.id);
  if (!data) throw ApiError.notFound('Student record not found.');
  return sendSuccess(res, data);
});

/**
 * PATCH /api/admin/students/:id/status
 */
export const updateStudentStatus = asyncHandler(async (req, res) => {
  const { placementStatus, backlogs, cgpa } = req.body;
  const updates = {};
  if (placementStatus) updates.placementStatus = placementStatus;
  if (backlogs !== undefined) updates.backlogs = Number(backlogs);
  if (cgpa !== undefined) updates.cgpa = Number(cgpa);

  const updated = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
  if (!updated) throw ApiError.notFound('Student record not found.');

  await logAdminAction(req.user, 'UPDATE_STUDENT_STATUS', 'User', req.params.id, updates, 'success', req);
  return sendSuccess(res, { student: updated.toSafeJSON() }, 'Student status updated successfully.');
});

/**
 * GET /api/admin/analytics
 */
export const getAnalytics = asyncHandler(async (req, res) => {
  const data = await getBatchWeaknessAnalytics();
  return sendSuccess(res, data);
});

/**
 * DELETE /api/admin/topics/:topic
 */
export const deleteTopic = asyncHandler(async (req, res) => {
  const topicName = decodeURIComponent(req.params.topic || '').trim();
  if (!topicName) throw ApiError.badRequest('Topic name is required.');

  await Promise.all([
    TopicPerformance.deleteMany({ topic: topicName }),
    Question.deleteMany({ topic: topicName }),
    Assessment.updateMany({}, { $pull: { questions: { topic: topicName } } }),
  ]);

  await logAdminAction(req.user, 'DELETE_TOPIC', 'TopicPerformance', null, { topic: topicName }, 'success', req);
  return sendSuccess(res, null, `Topic "${topicName}" removed successfully.`);
});

/**
 * GET /api/admin/eligibility
 */
export const screenEligibility = asyncHandler(async (req, res) => {
  const data = await screenEligibleStudents(req.query);
  return sendSuccess(res, data);
});

/**
 * GET /api/admin/eligibility/export
 */
export const exportEligibilityCsv = asyncHandler(async (req, res) => {
  const data = await screenEligibleStudents(req.query);
  const csv = generateStudentsCsv(data.students);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="eligible-students.csv"');
  return res.status(200).send(csv);
});

/**
 * GET /api/admin/students/export
 */
export const exportStudentsCsv = asyncHandler(async (req, res) => {
  const data = await getStudentDirectory({ ...req.query, limit: 2000, page: 1 });
  const csv = generateStudentsCsv(data.students);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="all-students.csv"');
  return res.status(200).send(csv);
});

/**
 * POST /api/admin/students/import
 */
export const importStudentsCsvEndpoint = asyncHandler(async (req, res) => {
  const csvText = req.body?.csvText || req.body?.content || '';
  if (!csvText) {
    throw ApiError.badRequest('CSV content is required (field: csvText).');
  }

  const result = await importStudentsFromCsv(csvText, req.user);
  return sendSuccess(res, result, 'CSV processed.');
});

// ======================== ASSESSMENTS CRUD ========================

/**
 * GET /api/admin/assessments
 */
export const listAssessments = asyncHandler(async (req, res) => {
  const list = await Assessment.find()
    .sort({ createdAt: -1 })
    .lean();

  const formatted = list.map((a) => ({
    id: a._id,
    _id: a._id,
    moduleKey: a.moduleKey,
    title: a.title,
    category: a.category,
    topic: a.topic,
    difficulty: a.difficulty,
    durationMinutes: a.durationMinutes,
    questionCount: Array.isArray(a.questions) ? a.questions.length : a.questionCount || 0,
    isPublished: a.isPublished !== false,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));

  return sendSuccess(res, { assessments: formatted });
});

/**
 * POST /api/admin/assessments
 */
export const createAssessment = asyncHandler(async (req, res) => {
  const { title, category, topic, difficulty, durationMinutes, moduleKey, questions } = req.body;
  if (!title || !category) {
    throw ApiError.badRequest('Title and category are required.');
  }

  const key = (moduleKey || title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim();
  const existing = await Assessment.findOne({ moduleKey: key });
  if (existing) {
    throw ApiError.conflict('An assessment module with that key already exists.');
  }

  const qList = Array.isArray(questions) ? questions : [];
  const assessment = await Assessment.create({
    moduleKey: key,
    title: title.trim(),
    category: category.trim(),
    topic: (topic || '').trim(),
    difficulty: difficulty || 'Medium',
    durationMinutes: Number(durationMinutes) || 45,
    questionCount: qList.length,
    questions: qList,
    isPublished: true,
  });

  await logAdminAction(req.user, 'CREATE_ASSESSMENT', 'Assessment', assessment._id, { title, moduleKey: key }, 'success', req);
  return sendSuccess(res, { assessment }, 'Assessment created successfully.', 201);
});

/**
 * PUT /api/admin/assessments/:id
 */
export const updateAssessment = asyncHandler(async (req, res) => {
  const { title, category, topic, difficulty, durationMinutes, isPublished, questions } = req.body;
  const updates = {};
  if (title) updates.title = title.trim();
  if (category) updates.category = category.trim();
  if (topic !== undefined) updates.topic = topic.trim();
  if (difficulty) updates.difficulty = difficulty;
  if (durationMinutes) updates.durationMinutes = Number(durationMinutes);
  if (isPublished !== undefined) updates.isPublished = Boolean(isPublished);
  if (Array.isArray(questions)) {
    updates.questions = questions;
    updates.questionCount = questions.length;
  }

  let assessment = null;
  if (mongoose.Types.ObjectId.isValid(req.params.id)) {
    assessment = await Assessment.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
  }
  if (!assessment) {
    assessment = await Assessment.findOneAndUpdate({ moduleKey: req.params.id }, { $set: updates }, { new: true });
  }
  if (!assessment) throw ApiError.notFound('Assessment not found.');

  await logAdminAction(req.user, 'UPDATE_ASSESSMENT', 'Assessment', assessment._id, updates, 'success', req);
  return sendSuccess(res, { assessment }, 'Assessment updated successfully.');
});

/**
 * PATCH /api/admin/assessments/:id/publish
 */
export const togglePublishAssessment = asyncHandler(async (req, res) => {
  let assessment = null;
  if (mongoose.Types.ObjectId.isValid(req.params.id)) {
    assessment = await Assessment.findById(req.params.id);
  }
  if (!assessment) {
    assessment = await Assessment.findOne({ moduleKey: req.params.id });
  }
  if (!assessment) throw ApiError.notFound('Assessment not found.');

  assessment.isPublished = !assessment.isPublished;
  await assessment.save();

  await logAdminAction(req.user, 'TOGGLE_PUBLISH_ASSESSMENT', 'Assessment', assessment._id, { isPublished: assessment.isPublished }, 'success', req);
  return sendSuccess(res, { isPublished: assessment.isPublished }, `Assessment ${assessment.isPublished ? 'published' : 'unpublished'} successfully.`);
});

/**
 * DELETE /api/admin/assessments/:id
 */
export const deleteAssessment = asyncHandler(async (req, res) => {
  let assessment = null;
  if (mongoose.Types.ObjectId.isValid(req.params.id)) {
    assessment = await Assessment.findByIdAndDelete(req.params.id);
  }
  if (!assessment) {
    assessment = await Assessment.findOneAndDelete({ moduleKey: req.params.id });
  }
  if (!assessment) throw ApiError.notFound('Assessment not found.');

  await logAdminAction(req.user, 'DELETE_ASSESSMENT', 'Assessment', assessment._id, { title: assessment.title, moduleKey: assessment.moduleKey }, 'success', req);
  return sendSuccess(res, null, 'Assessment deleted successfully.');
});

// ======================== QUESTION BANK CRUD ========================

/**
 * GET /api/admin/questions
 */
export const listQuestions = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = { isArchived: { $ne: true } };

  if (req.query.type) filter.type = req.query.type;
  if (req.query.difficulty) filter.difficulty = req.query.difficulty;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.topic) filter.topic = { $regex: new RegExp(req.query.topic.trim(), 'i') };
  if (req.query.search) {
    const s = String(req.query.search).trim();
    filter.$or = [
      { title: { $regex: s, $options: 'i' } },
      { question: { $regex: s, $options: 'i' } },
      { topic: { $regex: s, $options: 'i' } },
    ];
  }

  const [total, questions] = await Promise.all([
    Question.countDocuments(filter),
    Question.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return sendSuccess(res, {
    questions,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * POST /api/admin/questions
 */
export const createQuestion = asyncHandler(async (req, res) => {
  const { title, question, type, category, topic, difficulty, marks, options, correctKey, correctAnswer, explanation, hint, tags } = req.body;
  if (!title || !question || !category || !topic) {
    throw ApiError.badRequest('Title, question prompt, category, and topic are required.');
  }

  const created = await Question.create({
    title: title.trim(),
    question: question.trim(),
    type: type || 'mcq',
    category: category.trim(),
    topic: topic.trim(),
    difficulty: difficulty || 'Medium',
    marks: Number(marks) || 1,
    options: Array.isArray(options) ? options : [],
    correctKey: correctKey || '',
    correctAnswer: correctAnswer || null,
    explanation: explanation || '',
    hint: hint || '',
    tags: Array.isArray(tags) ? tags : [],
  });

  await logAdminAction(req.user, 'CREATE_QUESTION', 'Question', created._id, { title, type }, 'success', req);
  return sendSuccess(res, { question: created }, 'Question added to Question Bank.', 201);
});

/**
 * PUT /api/admin/questions/:id
 */
export const updateQuestion = asyncHandler(async (req, res) => {
  const updated = await Question.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!updated) throw ApiError.notFound('Question not found.');

  await logAdminAction(req.user, 'UPDATE_QUESTION', 'Question', updated._id, req.body, 'success', req);
  return sendSuccess(res, { question: updated }, 'Question updated successfully.');
});

/**
 * DELETE /api/admin/questions/:id
 */
export const deleteQuestion = asyncHandler(async (req, res) => {
  let question = null;
  if (mongoose.Types.ObjectId.isValid(req.params.id)) {
    question = await Question.findByIdAndUpdate(req.params.id, { $set: { isArchived: true } }, { new: true });
  }
  if (!question) {
    question = await Question.findOneAndUpdate({ questionId: req.params.id }, { $set: { isArchived: true } }, { new: true });
  }
  if (!question) throw ApiError.notFound('Question not found.');

  await logAdminAction(req.user, 'ARCHIVE_QUESTION', 'Question', question._id, {}, 'success', req);
  return sendSuccess(res, null, 'Question archived successfully.');
});

// ======================== PLACEMENT DRIVES CRUD ========================

/**
 * GET /api/admin/drives
 */
export const listDrives = asyncHandler(async (req, res) => {
  const drives = await PlacementDrive.find()
    .sort({ createdAt: -1 })
    .lean();

  const driveIds = drives.map((d) => d._id);
  const appCounts = await DriveApplication.aggregate([
    { $match: { driveId: { $in: driveIds } } },
    { $group: { _id: '$driveId', count: { $sum: 1 } } },
  ]);

  const countMap = new Map();
  appCounts.forEach((c) => countMap.set(String(c._id), c.count));

  const enriched = drives.map((d) => ({
    ...d,
    applicantCount: countMap.get(String(d._id)) || 0,
  }));

  return sendSuccess(res, { drives: enriched });
});

/**
 * POST /api/admin/drives
 */
export const createDrive = asyncHandler(async (req, res) => {
  const { company, role, package: pkg, description, driveDate, applicationDeadline, eligibleBranches, minCgpa, minReadiness, requiredSkills, maxBacklogs, status } = req.body;
  if (!company || !role) {
    throw ApiError.badRequest('Company and Role are required.');
  }

  const drive = await PlacementDrive.create({
    company: company.trim(),
    role: role.trim(),
    package: pkg || '',
    description: description || '',
    driveDate: driveDate ? new Date(driveDate) : null,
    applicationDeadline: applicationDeadline ? new Date(applicationDeadline) : null,
    eligibleBranches: Array.isArray(eligibleBranches) && eligibleBranches.length ? eligibleBranches : ['CSE', 'IT', 'ECE', 'EEE'],
    minCgpa: minCgpa !== undefined && minCgpa !== '' ? Number(minCgpa) : 6.0,
    minReadiness: minReadiness !== undefined && minReadiness !== '' ? Number(minReadiness) : 55,
    requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : [],
    maxBacklogs: maxBacklogs !== undefined && maxBacklogs !== '' ? Number(maxBacklogs) : 0,
    status: status || 'Open',
    createdBy: req.user._id,
  });

  await logAdminAction(req.user, 'CREATE_DRIVE', 'PlacementDrive', drive._id, { company, role }, 'success', req);
  return sendSuccess(res, { drive }, 'Placement Drive created successfully.', 201);
});

/**
 * PUT /api/admin/drives/:id
 */
export const updateDrive = asyncHandler(async (req, res) => {
  const drive = await PlacementDrive.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!drive) throw ApiError.notFound('Placement Drive not found.');

  await logAdminAction(req.user, 'UPDATE_DRIVE', 'PlacementDrive', drive._id, req.body, 'success', req);
  return sendSuccess(res, { drive }, 'Placement Drive updated successfully.');
});

/**
 * DELETE /api/admin/drives/:id
 */
export const deleteDrive = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw ApiError.badRequest('Invalid drive ID format.');
  }
  const drive = await PlacementDrive.findByIdAndDelete(req.params.id);
  if (!drive) throw ApiError.notFound('Placement Drive not found.');

  await logAdminAction(req.user, 'DELETE_DRIVE', 'PlacementDrive', req.params.id, { company: drive.company }, 'success', req);
  return sendSuccess(res, null, 'Placement Drive deleted.');
});

/**
 * GET /api/admin/drives/:id/eligible
 */
export const getDriveEligibleStudents = asyncHandler(async (req, res) => {
  const drive = await PlacementDrive.findById(req.params.id);
  if (!drive) throw ApiError.notFound('Placement Drive not found.');

  const result = await screenEligibleStudents({
    minCgpa: drive.minCgpa,
    minReadiness: drive.minReadiness,
    branches: drive.eligibleBranches,
    maxBacklogs: drive.maxBacklogs,
  });

  return sendSuccess(res, { drive, ...result });
});

// ======================== APPLICATIONS TRACKING ========================

/**
 * GET /api/admin/applications
 */
export const listApplications = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.driveId) filter.driveId = req.query.driveId;
  if (req.query.studentId) filter.studentId = req.query.studentId;
  if (req.query.status) filter.status = req.query.status;

  const applications = await DriveApplication.find(filter)
    .populate('driveId', 'company role package driveDate status')
    .populate('studentId', 'name email branch cgpa readinessScore registerNumber')
    .sort({ updatedAt: -1 })
    .lean();

  return sendSuccess(res, { applications });
});

/**
 * PATCH /api/admin/applications/:id/status
 */
export const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { status, stageNotes } = req.body;
  if (!status) throw ApiError.badRequest('Status is required.');

  const app = await DriveApplication.findById(req.params.id);
  if (!app) throw ApiError.notFound('Application not found.');

  app.status = status;
  if (stageNotes !== undefined) app.stageNotes = stageNotes;
  app.history.push({
    status,
    changedAt: new Date(),
    changedBy: req.user._id,
    notes: stageNotes || '',
  });

  await app.save();

  await logAdminAction(req.user, 'UPDATE_APPLICATION_STATUS', 'DriveApplication', app._id, { status, studentId: app.studentId }, 'success', req);
  return sendSuccess(res, { application: app }, 'Application status updated successfully.');
});

// ======================== NOTIFICATIONS ========================

/**
 * GET /api/admin/notifications
 */
export const listNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find()
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, { notifications });
});

/**
 * POST /api/admin/notifications
 */
export const createNotification = asyncHandler(async (req, res) => {
  const { title, message, type, targetRole, targetBranch, link, isPinned } = req.body;
  if (!title || !message) throw ApiError.badRequest('Title and message are required.');

  const notif = await Notification.create({
    title: title.trim(),
    message: message.trim(),
    type: type || 'announcement',
    targetRole: targetRole || 'all',
    targetBranch: targetBranch || '',
    link: link || '',
    isPinned: Boolean(isPinned),
    createdBy: req.user._id,
  });

  await logAdminAction(req.user, 'CREATE_NOTIFICATION', 'Notification', notif._id, { title }, 'success', req);
  return sendSuccess(res, { notification: notif }, 'Notification broadcasted successfully.', 201);
});

/**
 * DELETE /api/admin/notifications/:id
 */
export const deleteNotification = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw ApiError.badRequest('Invalid notification ID format.');
  }
  const notif = await Notification.findByIdAndDelete(req.params.id);
  if (!notif) throw ApiError.notFound('Notification not found.');

  await logAdminAction(req.user, 'DELETE_NOTIFICATION', 'Notification', req.params.id, { title: notif.title }, 'success', req);
  return sendSuccess(res, null, 'Notification removed.');
});

// ======================== AUDIT LOGS ========================

/**
 * GET /api/admin/logs
 */
export const listLogs = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const skip = (page - 1) * limit;

  const [total, logs] = await Promise.all([
    AdminLog.countDocuments(),
    AdminLog.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return sendSuccess(res, {
    logs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export default {
  getOverview,
  listStudents,
  getStudent,
  updateStudentStatus,
  getAnalytics,
  screenEligibility,
  exportEligibilityCsv,
  exportStudentsCsv,
  importStudentsCsvEndpoint,
  listAssessments,
  createAssessment,
  updateAssessment,
  togglePublishAssessment,
  deleteAssessment,
  listQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  listDrives,
  createDrive,
  updateDrive,
  deleteDrive,
  getDriveEligibleStudents,
  listApplications,
  updateApplicationStatus,
  listNotifications,
  createNotification,
  deleteNotification,
  listLogs,
};
