import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import assessmentRoutes from './assessment.routes.js';
import performanceRoutes from './performance.routes.js';
import roadmapRoutes from './roadmap.routes.js';
import interviewRoutes from './interview.routes.js';
import chatRoutes from './chat.routes.js';
import geminiRoutes from './gemini.routes.js';
import codeRoutes from './code.routes.js';
import adminRoutes from './admin.routes.js';
import driveRoutes from './drive.routes.js';
import notificationRoutes from './notification.routes.js';
import { ensureDatabaseConnection } from '../middleware/auth.middleware.js';
import { getDatabaseStatus } from '../config/database.js';

const router = Router();

// Every API route gets a guaranteed database connection first.
router.use(ensureDatabaseConnection);

router.get('/health', (req, res) => {
  const database = getDatabaseStatus();
  const timestamp = new Date().toISOString();
  res.json({
    success: true,
    status: 'ok',
    database,
    timestamp,
    data: { status: 'ok', database, timestamp },
  });
});
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/assessments', assessmentRoutes);
router.use('/performance', performanceRoutes);
router.use('/roadmap', roadmapRoutes);
router.use('/interviews', interviewRoutes);
router.use('/chat', chatRoutes);
router.use('/gemini', geminiRoutes);
router.use('/code', codeRoutes);
router.use('/admin', adminRoutes);
router.use('/drives', driveRoutes);
router.use('/notifications', notificationRoutes);

export default router;
