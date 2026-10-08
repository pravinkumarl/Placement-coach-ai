import { Router } from 'express';
import { protect, requireAdmin } from '../middleware/auth.middleware.js';
import * as adminController from '../controllers/admin.controller.js';

const router = Router();

// Protect ALL admin routes: valid token + role === 'admin'
router.use(protect);
router.use(requireAdmin);

// Phase 2 & 3: Overview & Core Analytics
router.get('/overview', adminController.getOverview);
router.get('/analytics', adminController.getAnalytics);
router.delete('/topics/:topic', adminController.deleteTopic);

// Phase 4 & 5: Students Directory, Drill-down, and Status updates
router.get('/students', adminController.listStudents);
router.get('/students/export', adminController.exportStudentsCsv);
router.post('/students/import', adminController.importStudentsCsvEndpoint);
router.get('/students/:id', adminController.getStudent);
router.patch('/students/:id/status', adminController.updateStudentStatus);

// Phase 10: Drive Eligibility Screener
router.get('/eligibility', adminController.screenEligibility);
router.get('/eligibility/export', adminController.exportEligibilityCsv);

// Phase 8: Assessment Management
router.get('/assessments', adminController.listAssessments);
router.post('/assessments', adminController.createAssessment);
router.put('/assessments/:id', adminController.updateAssessment);
router.patch('/assessments/:id/publish', adminController.togglePublishAssessment);
router.delete('/assessments/:id', adminController.deleteAssessment);

// Phase 9: Question Bank Management
router.get('/questions', adminController.listQuestions);
router.post('/questions', adminController.createQuestion);
router.put('/questions/:id', adminController.updateQuestion);
router.delete('/questions/:id', adminController.deleteQuestion);

// Phase 11: Placement Drives
router.get('/drives', adminController.listDrives);
router.post('/drives', adminController.createDrive);
router.put('/drives/:id', adminController.updateDrive);
router.delete('/drives/:id', adminController.deleteDrive);
router.get('/drives/:id/eligible', adminController.getDriveEligibleStudents);

// Phase 12: Application Tracking
router.get('/applications', adminController.listApplications);
router.patch('/applications/:id/status', adminController.updateApplicationStatus);

// Phase 14: Notifications & Announcements
router.get('/notifications', adminController.listNotifications);
router.post('/notifications', adminController.createNotification);
router.delete('/notifications/:id', adminController.deleteNotification);

// Phase 15: Audit Logs
router.get('/logs', adminController.listLogs);

export default router;
