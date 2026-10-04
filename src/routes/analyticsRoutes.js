import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getAnalyticsOverview, getActivityGraph, getContentEngagement, getUserActivity } from '../controllers/analyticsController.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/overview', getAnalyticsOverview);
router.get('/activity-graph', getActivityGraph);
router.get('/content-engagement', getContentEngagement);
router.get('/users', getUserActivity);

export default router;
