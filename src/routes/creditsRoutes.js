import { Router } from 'express';
import {
  getPublicCredits,
  getAllSections,
  createSection,
  updateSection,
  deleteSection,
  getMembersBySection,
  createMember,
  updateMember,
  deleteMember,
} from '../controllers/creditsController.js';
import { requireAuth, requireAdminOrCoordinator } from '../middleware/auth.js';
import { upload } from '../controllers/uploadController.js';

const router = Router();

// Public route
router.get('/public', getPublicCredits);

// Admin routes (require auth & admin role)
router.use(requireAuth, requireAdminOrCoordinator);

// Section routes
router.get('/sections', getAllSections);
router.post('/sections', createSection);
router.put('/sections/:id', updateSection);
router.delete('/sections/:id', deleteSection);

// Member routes
router.get('/sections/:sectionId/members', getMembersBySection);
router.post('/sections/:sectionId/members', upload.single('photo'), createMember);
router.put('/members/:id', upload.single('photo'), updateMember);
router.delete('/members/:id', deleteMember);

export default router;
