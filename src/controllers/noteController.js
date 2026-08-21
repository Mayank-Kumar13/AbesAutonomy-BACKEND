import { Readable } from 'stream';
import Note from '../models/Note.js';
import ApiResponse from '../utils/ApiResponse.js';
import { getFilteredNotes, searchNotes } from '../services/noteService.js';
import { deleteFile } from '../services/imagekitService.js';

/**
 * GET /api/notes
 * List notes with filters and pagination.
 */
export const listNotes = async (req, res, next) => {
  try {
    const { notes, total, page, limit } = await getFilteredNotes(req.query);
    return ApiResponse.paginated(res, notes, page, limit, total);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notes/search?q=...
 * Full-text search notes.
 */
export const searchNotesHandler = async (req, res, next) => {
  try {
    const { notes, total, page, limit } = await searchNotes(req.query);
    return ApiResponse.paginated(res, notes, page, limit, total);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notes/:id
 * Get a single note by ID.
 */
export const getNote = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate('uploadedBy', 'name email')
      .lean();

    if (!note) {
      return ApiResponse.notFound(res, 'Note not found');
    }

    return ApiResponse.success(res, note);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notes/:id/pdf
 * Stream the PDF file from ImageKit for the given note.
 */
export const streamNotePdf = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note || !note.pdfUrl) {
      return res.status(404).send('PDF not found');
    }

    const fetchOptions = { headers: {} };
    if (req.headers.range) {
      fetchOptions.headers['Range'] = req.headers.range;
    }

    const response = await fetch(note.pdfUrl, fetchOptions);

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch PDF from storage');
    }

    res.status(response.status);
    res.setHeader('Content-Type', 'application/pdf');
    // Expose headers for PDF.js to handle byte-ranges over CORS
    res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified');

    const headersToForward = ['content-length', 'accept-ranges', 'content-range', 'etag', 'last-modified'];
    for (const header of headersToForward) {
      if (response.headers.has(header)) {
        res.setHeader(header, response.headers.get(header));
      }
    }

    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/notes
 * Create a new note (admin only).
 */
export const createNote = async (req, res, next) => {
  try {
    const noteData = {
      title: req.body.title,
      description: req.body.description || '',
      subject: req.body.subject.toUpperCase(),
      branch: req.body.branch.toLowerCase(),
      year: parseInt(req.body.year, 10),
      resourceType: req.body.resourceType.toLowerCase(),
      pdfUrl: req.body.pdfUrl,
      semester: req.body.semester ? parseInt(req.body.semester, 10) : undefined,
      unit: req.body.unit ? parseInt(req.body.unit, 10) : undefined,
      university: req.body.university || 'ABES Engineering College',
      tags: req.body.tags || [],
      imagekitFileId: req.body.imagekitFileId || '',
      imagekitFilePath: req.body.imagekitFilePath || '',
      thumbnailUrl: req.body.thumbnailUrl || '',
      uploadedBy: req.user?._id,
      isPublished: req.body.isPublished !== undefined ? req.body.isPublished : true,
    };

    const note = await Note.create(noteData);
    return ApiResponse.created(res, note, 'Note created successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notes/:id
 * Update note metadata (admin only).
 */
export const updateNote = async (req, res, next) => {
  try {
    // Only allow specific fields to be updated
    const allowedFields = [
      'title', 'description', 'subject', 'branch', 'year',
      'resourceType', 'semester', 'unit', 'university', 'tags',
      'pdfUrl', 'imagekitFileId', 'imagekitFilePath', 'thumbnailUrl',
      'isPublished',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Normalize fields
    if (updates.subject) updates.subject = updates.subject.toUpperCase();
    if (updates.branch) updates.branch = updates.branch.toLowerCase();
    if (updates.resourceType) updates.resourceType = updates.resourceType.toLowerCase();
    if (updates.year) updates.year = parseInt(updates.year, 10);
    if (updates.semester) updates.semester = parseInt(updates.semester, 10);
    if (updates.unit) updates.unit = parseInt(updates.unit, 10);

    const note = await Note.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!note) {
      return ApiResponse.notFound(res, 'Note not found');
    }

    return ApiResponse.success(res, note, 'Note updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/notes/:id
 * Delete a note (admin only). Optionally deletes the ImageKit file.
 */
export const deleteNote = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);

    if (!note) {
      return ApiResponse.notFound(res, 'Note not found');
    }

    // Attempt to delete from ImageKit if file ID exists
    if (note.imagekitFileId && req.query.deleteFile !== 'false') {
      try {
        await deleteFile(note.imagekitFileId);
      } catch (ikError) {
        console.warn(`⚠️  Could not delete ImageKit file ${note.imagekitFileId}:`, ikError.message);
        // Continue with MongoDB deletion even if ImageKit fails
      }
    }

    await Note.findByIdAndDelete(req.params.id);
    return ApiResponse.success(res, null, 'Note deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/notes/:id/view
 * Increment view count.
 */
export const incrementViewCount = async (req, res, next) => {
  try {
    const note = await Note.findByIdAndUpdate(
      req.params.id,
      { $inc: { viewCount: 1 } },
      { new: true }
    );

    if (!note) {
      return ApiResponse.notFound(res, 'Note not found');
    }

    return ApiResponse.success(res, { viewCount: note.viewCount });
  } catch (error) {
    next(error);
  }
};
