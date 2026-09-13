import express from 'express';
import { pingLocation, getLiveUsers, getPdfLogs } from '../controllers/trackingController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/status', requireAuth, pingLocation);
router.get('/active', requireAuth, requireAdmin, getLiveUsers);
router.get('/history', requireAuth, requireAdmin, getPdfLogs);

export default router;
