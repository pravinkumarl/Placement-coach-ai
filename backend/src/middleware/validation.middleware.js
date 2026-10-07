import mongoose from 'mongoose';
import { ApiError } from '../utils/response.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmptyValue(value) {
  return value === undefined || value === null || value === '';
}

function checkType(value, rule) {
  const type = rule.type;
  switch (type) {
    case 'email':
      return typeof value === 'string' && EMAIL_RE.test(value.trim());
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'date':
      return !Number.isNaN(Date.parse(value));
    case 'enum':
      return typeof value === 'string' && (rule.values || []).includes(value);
    case 'objectId':
      return mongoose.Types.ObjectId.isValid(value);
    default:
      return true;
  }
}

/**
 * Request body validator.
 *
 * Usage:
 *   router.post('/register', validateBody({
 *     name: { required: true, min: 2, max: 100 },
 *     email: { required: true, type: 'email' },
 *     password: { required: true, min: 8, max: 128 },
 *   }), handler)
 */
export function validateBody(rules) {
  return (req, res, next) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const errors = [];

    for (const [field, rule] of Object.entries(rules)) {
      let value = body[field];

      if (isEmptyValue(value)) {
        if (rule.required) errors.push(`${field} is required`);
        continue;
      }

      if (rule.type && !checkType(value, rule)) {
        errors.push(`${field} must be a valid ${rule.type}`);
        continue;
      }

      if (rule.type === 'string' || (typeof value === 'string' && rule.trim !== false)) {
        value = String(value).trim();
        body[field] = value;
      }

      if (typeof value === 'string') {
        if (rule.min && value.length < rule.min) {
          errors.push(`${field} must be at least ${rule.min} characters`);
        }
        if (rule.max && value.length > rule.max) {
          errors.push(`${field} must be at most ${rule.max} characters`);
        }
      }

      if (typeof value === 'number') {
        if (typeof rule.min === 'number' && value < rule.min) {
          errors.push(`${field} must be at least ${rule.min}`);
        }
        if (typeof rule.max === 'number' && value > rule.max) {
          errors.push(`${field} must be at most ${rule.max}`);
        }
      }
    }

    if (errors.length > 0) {
      return next(ApiError.badRequest(errors.join('. ')));
    }

    req.body = body;
    return next();
  };
}

/**
 * Validate and normalize an :id route parameter.
 */
export function validateIdParam(paramName = 'id') {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!value || !mongoose.Types.ObjectId.isValid(value)) {
      return next(ApiError.badRequest(`Invalid ${paramName} supplied.`));
    }
    return next();
  };
}

export default { validateBody, validateIdParam };
