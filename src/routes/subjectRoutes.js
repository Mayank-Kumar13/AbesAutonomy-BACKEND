import { Router } from 'express';
import {
  getSubjects,
  getAllSubjects,
  createSubject,
  updateSubject,
  deleteSubject
} from '../controllers/subjectController.js';
import { requireAuth, requireAdmin, requireAdminOrCoordinator } from '../middleware/auth.js';

const router = Router();

// Public routes
router.get('/', getSubjects);

// Admin / Coordinator routes
router.get('/all', requireAuth, requireAdminOrCoordinator, getAllSubjects);

// Admin-only routes for modifications
router.use(requireAuth, requireAdmin);
router.post('/', createSubject);
router.put('/:id', updateSubject);
router.delete('/:id', deleteSubject);

export default router;
