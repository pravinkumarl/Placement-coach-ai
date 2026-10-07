import { Router } from 'express';
import {
  listAssessments,
  getAssessment,
  startAssessment,
  submitAssessment,
  listAttempts,
  getAssessmentResults,
  getAssessmentStats,
} from '../controllers/assessment.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

router.use(protect);

router.get('/attempts', listAttempts);
router.get('/history', listAttempts);
router.get('/stats', getAssessmentStats);
router.get('/', listAssessments);
router.get('/:id/results', getAssessmentResults);
router.get('/:id', getAssessment);
router.post('/:id/start', startAssessment);
router.post('/:id/submit', submitAssessment);

export default router;
