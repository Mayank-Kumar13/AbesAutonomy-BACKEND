import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getSettings, updateSettings } from '../controllers/settingsController.js';

const router = Router();

// Public route to get the website status
router.get('/', getSettings);

// Admin-only route to update the website status
router.patch('/', requireAuth, requireAdmin, updateSettings);

export default router;
