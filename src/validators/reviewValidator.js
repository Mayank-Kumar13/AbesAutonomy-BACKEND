import { body } from 'express-validator';

export const createReviewValidation = [
  body('rating')
    .notEmpty().withMessage('Rating is required')
    .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('content')
    .trim()
    .notEmpty().withMessage('Review content is required')
    .isLength({ min: 10 }).withMessage('Review must be at least 10 characters')
    .isLength({ max: 500 }).withMessage('Review cannot exceed 500 characters')
    .escape(),
];
