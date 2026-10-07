import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  changePassword,
} from '../controllers/user.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';

const router = Router();

router.use(protect);

router.get('/profile', getProfile);
router.get('/me', getProfile);

router.patch(
  '/profile',
  validateBody({
    name: { min: 2, max: 120 },
    phone: { max: 30 },
    college: { max: 200 },
    degree: { max: 120 },
    branch: { max: 120 },
    graduationYear: { type: 'integer', min: 2000, max: 2100 },
    bio: { max: 1000 },
    cgpa: { type: 'number', min: 0, max: 10 },
    targetRole: { max: 160 },
    avatar: { max: 500 },
  }),
  updateProfile
);

router.put('/profile', updateProfile);
router.put('/me', updateProfile);
router.patch('/me', updateProfile);

router.patch(
  '/password',
  validateBody({
    currentPassword: { required: true, min: 1, max: 128 },
    newPassword: { required: true, min: 8, max: 128 },
  }),
  changePassword
);

router.patch(
  '/me/password',
  validateBody({
    currentPassword: { required: true, min: 1, max: 128 },
    newPassword: { required: true, min: 8, max: 128 },
  }),
  changePassword
);

export default router;
