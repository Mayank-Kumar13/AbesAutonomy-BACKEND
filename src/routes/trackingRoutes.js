import express from 'express';
import { pingLocation, getLiveUsers } from '../controllers/trackingController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/ping', requireAuth, pingLocation);
router.get('/live', requireAuth, requireAdmin, getLiveUsers);

export default router;
