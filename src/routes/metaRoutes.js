import { Router } from 'express';
import { getSubjects, getBranches, getStats } from '../controllers/metaController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ─── Public routes ────────────────────────────────────
router.get('/subjects', getSubjects);
router.get('/branches', getBranches);

// ─── Admin routes ─────────────────────────────────────
router.get('/stats', requireAuth, requireAdmin, getStats);

export default router;
