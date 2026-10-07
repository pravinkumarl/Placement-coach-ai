/**
 * Response helpers — every API response follows the same envelope:
 *   success: { success: true,  message?, data? }
 *   failure: { success: false, message }
 */

export class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message);
  }

  static tooMany(message = 'Too many requests. Please try again later.') {
    return new ApiError(429, message);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return new ApiError(503, message);
  }
}

/**
 * Send a success payload.
 * @param {import('express').Response} res
 * @param {object} data
 * @param {string} [message]
 * @param {number} [statusCode]
 */
export function sendSuccess(res, data, message, statusCode = 200) {
  const body = { success: true };
  if (message) body.message = message;
  if (data !== undefined) body.data = data;
  return res.status(statusCode).json(body);
}

/**
 * Send an error payload.
 */
export function sendError(res, statusCode, message) {
  return res.status(statusCode).json({ success: false, message });
}

/**
 * Wrap an async route handler so rejections reach the error middleware.
 */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export default { ApiError, sendSuccess, sendError, asyncHandler };
