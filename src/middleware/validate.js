import { validationResult } from 'express-validator';
import ApiResponse from '../utils/ApiResponse.js';

/**
 * Middleware to check express-validator results.
 * Placed AFTER validation chains in the route.
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));
    return ApiResponse.badRequest(res, 'Validation failed', formattedErrors);
  }
  next();
};

export default validate;
