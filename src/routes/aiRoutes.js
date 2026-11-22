import { Router } from 'express';
import { chatAssistant, summarizeStudyMaterial } from '../controllers/aiController.js';
import { chatWithPdf, getPdfChatStatus } from '../controllers/pdfChatController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePremium } from '../middleware/accessControl.js';
import env from '../config/env.js';

const router = Router();

// ALL AI endpoints require authentication.
router.use(requireAuth);

// PDF chat follows the platform's premium rule unless AI_PDF_CHAT_PREMIUM_ONLY=false.
const pdfChatGate = (req, res, next) => (env.AI_PDF_CHAT_PREMIUM_ONLY ? requirePremium(req, res, next) : next());

// Chat about the PDF currently open in the viewer (answers come from that PDF only).
router.get('/pdf-chat/:noteId/status', pdfChatGate, getPdfChatStatus);
router.post('/pdf-chat', pdfChatGate, chatWithPdf);

// Other AI endpoints require an active Premium subscription (or Super Admin exemption).
router.post('/assistant/chat', requirePremium, chatAssistant);
router.post('/summarize', requirePremium, summarizeStudyMaterial);

export default router;
