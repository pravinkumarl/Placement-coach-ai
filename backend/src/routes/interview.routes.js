import { Router } from 'express';
import {
  createInterview,
  listInterviews,
  getInterview,
  submitAnswer,
  completeInterview,
  deleteInterview,
} from '../controllers/interview.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';

const router = Router();

router.use(protect);

router.post(
  '/',
  validateBody({
    type: { type: 'enum', values: ['hr', 'technical', 'managerial', 'mock'] },
    difficulty: { type: 'enum', values: ['Easy', 'Medium', 'Hard'] },
    role: { max: 160 },
    company: { max: 160 },
    questionCount: { type: 'integer', min: 3, max: 10 },
  }),
  createInterview
);
router.get('/', listInterviews);
router.get('/:id', getInterview);
router.post('/:id/answers', submitAnswer);
router.post('/:id/complete', completeInterview);
router.delete('/:id', deleteInterview);

export default router;
