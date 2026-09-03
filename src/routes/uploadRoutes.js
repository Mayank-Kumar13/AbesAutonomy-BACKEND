import { Router } from 'express';
import {
  upload,
  uploadPdfAndCreateNote,
  registerExistingPdf,
  deleteImageKitFile,
} from '../controllers/uploadController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// All upload routes require admin auth
router.use(requireAuth, requireAdmin);

// Upload PDF file to ImageKit and create note
router.post('/pdf', uploadLimiter, upload.single('file'), uploadPdfAndCreateNote);

// Register an existing ImageKit PDF in MongoDB
router.post('/register', registerExistingPdf);

// Delete a file from ImageKit
router.delete('/:fileId', deleteImageKitFile);

export default router;
