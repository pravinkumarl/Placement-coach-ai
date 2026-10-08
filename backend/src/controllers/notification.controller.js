import Notification from '../models/Notification.js';
import { sendSuccess, asyncHandler } from '../utils/response.js';

/**
 * GET /api/notifications — list announcements for student
 */
export const listNotifications = asyncHandler(async (req, res) => {
  const filter = {
    targetRole: { $in: ['all', req.user?.role || 'student'] },
  };

  const notifications = await Notification.find(filter)
    .sort({ isPinned: -1, createdAt: -1 })
    .limit(20)
    .lean();

  return sendSuccess(res, { notifications });
});

export default { listNotifications };
