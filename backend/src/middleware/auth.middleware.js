import { verifyToken } from '../utils/jwt.js';
import { ApiError } from '../utils/response.js';
import User from '../models/User.js';
import { connectDatabase, getDatabaseStatus } from '../config/database.js';

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.headers['x-access-token']) return String(req.headers['x-access-token']).trim();
  return null;
}

/**
 * Protect private routes: requires a valid JWT that belongs to an existing user.
 */
export async function protect(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      throw ApiError.unauthorized('You must be signed in to access this resource.');
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);

    if (!user) {
      throw ApiError.unauthorized('Your account no longer exists. Please sign in again.');
    }

    req.user = user;
    req.token = token;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Ensure MongoDB is connected before handling an API request.
 * Works for both the long-running server and Vercel serverless invocations.
 */
export async function ensureDatabaseConnection(req, res, next) {
  try {
    if (getDatabaseStatus() !== 'connected') {
      await connectDatabase();
    }
    return next();
  } catch (error) {
    console.error('[db] connection error:', error.message);
    return next(ApiError.serviceUnavailable('Database is unavailable. Please try again shortly.'));
  }
}

/**
 * Require administrator privileges. Must be called after protect middleware.
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return next(ApiError.unauthorized('You must be signed in to access this resource.'));
  }
  if (req.user.role !== 'admin') {
    return next(ApiError.forbidden('Access denied. Administrator privileges required.'));
  }
  return next();
}

export default protect;
