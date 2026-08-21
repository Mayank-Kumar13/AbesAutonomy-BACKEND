import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { heartbeat } from '../controllers/activityController.js';

const router = Router();

router.post('/heartbeat', requireAuth, heartbeat);

export default router;