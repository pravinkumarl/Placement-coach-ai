import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import * as notificationController from '../controllers/notification.controller.js';

const router = Router();

router.use(protect);
router.get('/', notificationController.listNotifications);

export default router;
