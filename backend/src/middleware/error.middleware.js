import env from '../config/env.js';
import { ApiError, sendError } from '../utils/response.js';

/**
 * Handle "route not found" for API paths (JSON, never HTML).
 */
export function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api')) {
    return sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
  }
  return next();
}

/**
 * Centralized error handler — the only place that formats errors.
 * Never leaks stack traces in production.
 */
export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let statusCode = error.statusCode || error.status || 500;
  let message = error.message || 'Something went wrong. Please try again.';

  // Mongoose: duplicate key
  if (error.code === 11000) {
    statusCode = 409;
    const field = Object.keys(error.keyValue || {})[0] || 'field';
    message = `An account with that ${field} already exists.`;
  }

  // Mongoose: validation errors
  if (error.name === 'ValidationError' && error.errors) {
    statusCode = 400;
    message = Object.values(error.errors)
      .map((e) => e.message)
      .join('; ');
  }

  // Mongoose: invalid ObjectId / cast errors
  if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid identifier supplied for one of the resources.';
  }

  // Body parser errors
  if (error.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON in request body.';
  }
  if (error.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request payload is too large.';
  }

  // Unexpected server error
  if (statusCode >= 500 && error instanceof ApiError === false) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, error.message);
    if (!env.isProduction) {
      console.error(error.stack);
    }
    if (env.isProduction) {
      message = 'Internal server error';
    }
  }

  return sendError(res, statusCode, message);
}

export default errorHandler;
