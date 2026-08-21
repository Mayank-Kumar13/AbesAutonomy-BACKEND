import { Router } from 'express';
import {
  getReviews,
  createReview,
  deleteReview,
} from '../controllers/reviewController.js';
import { requireAuth } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { createReviewValidation } from '../validators/reviewValidator.js';

const router = Router();

// ─── Public routes ────────────────────────────────────
router.get('/', getReviews);

// ─── Authenticated routes ─────────────────────────────
router.post('/', requireAuth, createReviewValidation, validate, createReview);
router.delete('/', requireAuth, deleteReview);

export default router;
