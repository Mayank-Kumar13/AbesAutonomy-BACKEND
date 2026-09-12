import { Router } from 'express';
import {
  getSubjects,
  getAllSubjects,
  createSubject,
  updateSubject,
  deleteSubject
} from '../controllers/subjectController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Public routes
router.get('/', getSubjects);

// Admin routes
router.use(requireAuth, requireAdmin);
router.get('/all', getAllSubjects);
router.post('/', createSubject);
router.put('/:id', updateSubject);
router.delete('/:id', deleteSubject);

export default router;
