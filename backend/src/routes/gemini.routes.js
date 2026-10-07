import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import geminiProxy from '../controllers/gemini.controller.js';
import { geminiText } from '../controllers/chat.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many AI requests. Please slow down.' },
});

router.use(protect);
router.use(aiLimiter);

router.post('/', geminiProxy);
router.post('/text', geminiText);

export default router;
