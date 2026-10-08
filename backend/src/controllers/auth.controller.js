import User from '../models/User.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { ApiError, sendSuccess, asyncHandler } from '../utils/response.js';
import { ensureDefaultRoadmap } from '../services/roadmap.service.js';

function buildAuthPayload(user) {
  return {
    token: signToken(user._id, user.role || 'student'),
    user: user.toSafeJSON(),
  };
}

/**
 * POST /api/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, college, degree, branch, graduationYear } = req.body;

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw ApiError.conflict('An account with that email already exists. Please sign in instead.');
  }

  const passwordHash = await hashPassword(String(password));
  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash,
    college: college || '',
    degree: degree || '',
    branch: branch || '',
    graduationYear: graduationYear || new Date().getFullYear() + 1,
  });

  await ensureDefaultRoadmap(user._id);

  return sendSuccess(res, buildAuthPayload(user), 'Account created successfully.', 201);
});

/**
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
  const invalid = ApiError.unauthorized('Incorrect email or password.');

  if (!user) throw invalid;

  const matches = await comparePassword(String(password), user.passwordHash);
  if (!matches) throw invalid;

  return sendSuccess(res, buildAuthPayload(user), 'Signed in successfully.');
});

/**
 * GET /api/auth/me
 */
export const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, { user: req.user.toSafeJSON() });
});

/**
 * POST /api/auth/logout — stateless JWT, client discards the token.
 */
export const logout = asyncHandler(async (req, res) => {
  return sendSuccess(res, null, 'Signed out successfully.');
});

export default { register, login, me, logout };
