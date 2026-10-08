import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import * as driveController from '../controllers/drive.controller.js';

const router = Router();

router.use(protect);
router.get('/', driveController.listOpenDrives);
router.post('/:id/apply', driveController.applyToDrive);
router.get('/my-applications', driveController.getMyApplications);

export default router;
