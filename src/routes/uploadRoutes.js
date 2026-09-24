import { Router } from 'express';
import {
  upload,
  uploadPdfAndCreateNote,
  registerExistingPdf,
  deleteImageKitFile,
} from '../controllers/uploadController.js';
import { requireAuth, requireAdminOrCoordinator, requireAdmin } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Upload PDF file to ImageKit and create note
router.post('/pdf', requireAuth, requireAdminOrCoordinator, uploadLimiter, upload.single('file'), uploadPdfAndCreateNote);

// Register an existing ImageKit PDF in MongoDB
router.post('/register', requireAuth, requireAdminOrCoordinator, registerExistingPdf);

// Delete a file from ImageKit
router.delete('/:fileId', requireAuth, requireAdmin, deleteImageKitFile);

export default router;
