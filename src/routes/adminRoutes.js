import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getStats, getUsers, getLogs } from '../controllers/adminController.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.get('/logs', getLogs);

export default router;