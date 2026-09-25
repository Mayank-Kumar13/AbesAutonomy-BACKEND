import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getSettings, updateSettings, reactToAnnouncement } from '../controllers/settingsController.js';

const router = Router();

// Public route to get the website status
router.get('/', getSettings);

// Public route to react to an announcement
router.post('/react', reactToAnnouncement);

// Admin-only route to update the website status
router.patch('/', requireAuth, requireAdmin, updateSettings);

export default router;
