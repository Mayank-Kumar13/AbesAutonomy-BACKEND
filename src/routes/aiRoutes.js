import { Router } from 'express';
import { chatAssistant, summarizeStudyMaterial } from '../controllers/aiController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePremium } from '../middleware/accessControl.js';

const router = Router();

// ALL AI endpoints require authentication AND active Premium subscription (or Super Admin exemption)
router.use(requireAuth);
router.use(requirePremium);

router.post('/assistant/chat', chatAssistant);
router.post('/summarize', summarizeStudyMaterial);

export default router;
