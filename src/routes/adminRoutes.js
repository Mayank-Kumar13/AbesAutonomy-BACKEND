import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getStats, getUsers, getLogs, getReviews, deleteReview, deleteUser, updateUserRole, clearLogs, getAdminActivities } from '../controllers/adminController.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.delete('/users/:id', deleteUser);
router.patch('/users/:id/role', updateUserRole);
router.get('/logs', getLogs);
router.delete('/logs', clearLogs);
router.get('/reviews', getReviews);
router.delete('/reviews/:id', deleteReview);
router.get('/activities', getAdminActivities);

export default router;