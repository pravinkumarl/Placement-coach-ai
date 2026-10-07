import { Router } from 'express';
import {
  getPerformance,
  getPerformanceTopics,
  getPerformanceHistory,
  getInsights,
} from '../controllers/performance.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

router.use(protect);

router.get('/', getPerformance);
router.get('/topics', getPerformanceTopics);
router.get('/history', getPerformanceHistory);
router.get('/insights', getInsights);

export default router;
