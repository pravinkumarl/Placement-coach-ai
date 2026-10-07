import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, me, logout } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';

const router = Router();

// Brute force protection for credential endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Try again in 15 minutes.' },
});

router.post(
  '/register',
  authLimiter,
  validateBody({
    name: { required: true, min: 2, max: 120 },
    email: { required: true, type: 'email', max: 200 },
    password: { required: true, min: 8, max: 128 },
    college: { max: 200 },
    degree: { max: 120 },
    branch: { max: 120 },
    graduationYear: { type: 'integer', min: 2000, max: 2100 },
  }),
  register
);

router.post(
  '/login',
  authLimiter,
  validateBody({
    email: { required: true, type: 'email', max: 200 },
    password: { required: true, min: 1, max: 128 },
  }),
  login
);

router.get('/me', protect, me);
router.post('/logout', protect, logout);

export default router;
