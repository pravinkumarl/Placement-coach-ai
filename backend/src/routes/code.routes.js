import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import codeController from '../controllers/code.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

const codeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many code execution requests. Please slow down.' },
});

router.use(protect);
router.use(codeLimiter);

router.get('/languages', codeController.listLanguages);
router.post('/execute', codeController.executeProgram);
router.post('/run', codeController.runCode);
router.post('/submit', codeController.submitCode);

export default router;