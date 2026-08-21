import { body, query, param } from 'express-validator';
import { RESOURCE_TYPES, BRANCHES } from '../models/Note.js';

export const createNoteValidation = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
  body('subject')
    .trim()
    .notEmpty().withMessage('Subject is required'),
  body('branch')
    .trim()
    .notEmpty().withMessage('Branch is required')
    .isIn(BRANCHES).withMessage('Invalid branch'),
  body('year')
    .isInt({ min: 1, max: 4 }).withMessage('Year must be between 1 and 4'),
  body('resourceType')
    .trim()
    .notEmpty().withMessage('Resource type is required')
    .isIn(RESOURCE_TYPES).withMessage('Invalid resource type'),
  body('pdfUrl')
    .trim()
    .notEmpty().withMessage('PDF URL is required')
    .isURL().withMessage('Invalid PDF URL'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  body('semester')
    .optional()
    .isInt({ min: 1, max: 8 }).withMessage('Semester must be between 1 and 8'),
  body('unit')
    .optional()
    .isInt({ min: 1, max: 10 }).withMessage('Unit must be between 1 and 10'),
  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .isString().withMessage('Each tag must be a string')
    .trim(),
];

export const updateNoteValidation = [
  param('id')
    .isMongoId().withMessage('Invalid note ID'),
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
  body('subject')
    .optional()
    .trim(),
  body('branch')
    .optional()
    .trim()
    .isIn(BRANCHES).withMessage('Invalid branch'),
  body('year')
    .optional()
    .isInt({ min: 1, max: 4 }).withMessage('Year must be between 1 and 4'),
  body('resourceType')
    .optional()
    .trim()
    .isIn(RESOURCE_TYPES).withMessage('Invalid resource type'),
  body('pdfUrl')
    .optional()
    .trim()
    .isURL().withMessage('Invalid PDF URL'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  body('semester')
    .optional()
    .isInt({ min: 1, max: 8 }).withMessage('Semester must be between 1 and 8'),
  body('unit')
    .optional()
    .isInt({ min: 1, max: 10 }).withMessage('Unit must be between 1 and 10'),
  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array'),
];

export const listNotesValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('branch')
    .optional()
    .isIn(BRANCHES).withMessage('Invalid branch'),
  query('year')
    .optional()
    .isInt({ min: 1, max: 4 }).withMessage('Year must be between 1 and 4'),
  query('resourceType')
    .optional()
    .isIn(RESOURCE_TYPES).withMessage('Invalid resource type'),
  query('subject')
    .optional()
    .trim(),
  query('unit')
    .optional()
    .isInt({ min: 1, max: 10 }).withMessage('Unit must be between 1 and 10'),
];

export const searchNotesValidation = [
  query('q')
    .trim()
    .notEmpty().withMessage('Search query is required')
    .isLength({ min: 2 }).withMessage('Search query must be at least 2 characters'),
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
];

export const noteIdValidation = [
  param('id')
    .isMongoId().withMessage('Invalid note ID'),
];
