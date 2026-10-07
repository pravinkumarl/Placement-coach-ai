import jwt from 'jsonwebtoken';
import env from '../config/env.js';

/**
 * Sign a JWT containing the user id.
 * @param {string} userId
 * @returns {string}
 */
export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

/**
 * Verify a JWT and return its payload.
 * Throws an ApiError(401) with a safe, human readable message.
 * @param {string} token
 * @returns {{ sub: string }}
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      const err = new Error('Your session has expired. Please sign in again.');
      err.statusCode = 401;
      err.code = 'TOKEN_EXPIRED';
      throw err;
    }
    const err = new Error('Invalid authentication token. Please sign in again.');
    err.statusCode = 401;
    err.code = 'TOKEN_INVALID';
    throw err;
  }
}

export default { signToken, verifyToken };
