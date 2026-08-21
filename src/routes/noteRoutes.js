import { Router } from 'express';
import {
  listNotes,
  searchNotesHandler,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  incrementViewCount,
  streamNotePdf,
} from '../controllers/noteController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import {
  createNoteValidation,
  updateNoteValidation,
  listNotesValidation,
  searchNotesValidation,
  noteIdValidation,
} from '../validators/noteValidator.js';

const router = Router();

// ─── Public routes ────────────────────────────────────
// Search must come BEFORE /:id to avoid route conflict
router.get('/search', searchNotesValidation, validate, searchNotesHandler);
router.get('/', listNotesValidation, validate, listNotes);
router.get('/:id', noteIdValidation, validate, getNote);
router.get('/:id/pdf', noteIdValidation, validate, streamNotePdf);
router.post('/:id/view', noteIdValidation, validate, incrementViewCount);

// ─── Admin routes ─────────────────────────────────────
router.post('/', requireAuth, requireAdmin, createNoteValidation, validate, createNote);
router.patch('/:id', requireAuth, requireAdmin, updateNoteValidation, validate, updateNote);
router.delete('/:id', requireAuth, requireAdmin, noteIdValidation, validate, deleteNote);

export default router;
