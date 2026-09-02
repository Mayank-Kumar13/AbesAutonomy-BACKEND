import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getStats, getUsers, getLogs, getReviews, deleteReview } from '../controllers/adminController.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.get('/logs', getLogs);
router.get('/reviews', getReviews);
router.delete('/reviews/:id', deleteReview);

export default router;