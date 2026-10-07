import User from '../models/User.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { ApiError, sendSuccess, asyncHandler } from '../utils/response.js';

const UPDATABLE_FIELDS = [
  'name',
  'phone',
  'college',
  'degree',
  'branch',
  'graduationYear',
  'avatar',
  'bio',
  'cgpa',
  'targetRole',
  'targetCompanies',
  'skills',
  'interests',
];

/**
 * GET /api/users/profile
 */
export const getProfile = asyncHandler(async (req, res) => {
  return sendSuccess(res, { user: req.user.toSafeJSON() });
});

/**
 * PATCH /api/users/profile  (PUT also accepted)
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const updates = {};

  for (const field of UPDATABLE_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  if (body.social && typeof body.social === 'object') {
    updates.social = {
      github: String(body.social.github || '').trim(),
      linkedin: String(body.social.linkedin || '').trim(),
    };
  }

  // Email is intentionally not editable via this endpoint.
  if (body.email !== undefined && String(body.email).trim().toLowerCase() !== req.user.email) {
    throw ApiError.badRequest('Email cannot be changed here.');
  }

  if (updates.name !== undefined && !String(updates.name).trim()) {
    throw ApiError.badRequest('Name cannot be empty.');
  }

  const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, {
    new: true,
    runValidators: true,
  });

  return sendSuccess(res, { user: user.toSafeJSON() }, 'Profile updated successfully.');
});

/**
 * PATCH /api/users/password
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw ApiError.badRequest('currentPassword and newPassword are required.');
  }
  if (String(newPassword).length < 8) {
    throw ApiError.badRequest('New password must be at least 8 characters.');
  }

  const user = await User.findById(req.user._id).select('+passwordHash');
  const matches = await comparePassword(String(currentPassword), user.passwordHash);
  if (!matches) throw ApiError.badRequest('Your current password is incorrect.');

  user.passwordHash = await hashPassword(String(newPassword));
  await user.save();

  return sendSuccess(res, null, 'Password updated successfully.');
});

export default { getProfile, updateProfile, changePassword };
