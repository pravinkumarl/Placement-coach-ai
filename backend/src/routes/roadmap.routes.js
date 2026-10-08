import { Router } from 'express';
import {
  getRoadmap,
  createMilestone,
  startMilestone,
  updateMilestone,
  replaceMilestone,
  deleteMilestone,
  reorderMilestone,
  regenerateRoadmap,
  resetRoadmap,
} from '../controllers/roadmap.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

router.use(protect);

router.get('/', getRoadmap);
router.post('/', createMilestone);
router.post('/generate', regenerateRoadmap);
router.delete('/', resetRoadmap);

router.put('/:milestoneId', replaceMilestone);
router.patch('/:milestoneId/status', updateMilestone);
router.delete('/:milestoneId', deleteMilestone);

router.patch('/milestones/:milestoneId/start', startMilestone);
router.patch('/milestones/:milestoneId', updateMilestone);
router.patch('/milestones/:milestoneId/reorder', reorderMilestone);

router.patch('/:milestoneId/start', startMilestone);

export default router;
