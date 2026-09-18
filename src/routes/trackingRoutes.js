import express from 'express';
import { pingLocation, getLiveUsers, getPdfLogs, testPingLocation, recordVisit } from '../controllers/trackingController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/status', requireAuth, pingLocation);
router.get('/active', requireAuth, requireAdmin, getLiveUsers);
router.get('/history', requireAuth, requireAdmin, getPdfLogs);

// Fallbacks for cached clients
router.post('/ping', requireAuth, pingLocation);
router.get('/live', requireAuth, requireAdmin, getLiveUsers);
router.get('/logs', requireAuth, requireAdmin, getPdfLogs);

// Unprotected test route
router.post('/test-status', testPingLocation);

// Public visit tracking route
router.post('/visit', recordVisit);

export default router;
