import { Readable } from 'stream';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import Note from '../models/Note.js';
import ApiResponse from '../utils/ApiResponse.js';
import { getFilteredNotes, searchNotes } from '../services/noteService.js';
import { deleteFile } from '../services/imagekitService.js';
import { logAdminActivity } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      .select('-pdfUrl -imagekitFileId -imagekitFilePath')
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
 * Stream the clean PDF for online viewing.
 */
export const streamNotePdf = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note || !note.pdfUrl) {
      return res.status(404).send('PDF not found');
    }

    const response = await fetch(note.pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF from storage: ${response.statusText}`);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(note.title)}.pdf"`);

    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notes/:id/download
 * Download a dynamically watermarked PDF.
 */
export const downloadNotePdf = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note || !note.pdfUrl) {
      return res.status(404).send('PDF not found');
    }

    try {
      const pdfResponse = await fetch(note.pdfUrl);
      if (!pdfResponse.ok) throw new Error('Failed to fetch PDF from CDN');
      
      const arrayBuffer = await pdfResponse.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();
      
      const viewerName = req.user ? (req.user.name || req.user.email) : 'Guest User';
      
      // Try to load logo
      let logoImage;
      try {
        const logoPath = path.resolve(__dirname, '../../logo.png');
        if (fs.existsSync(logoPath)) {
          const logoBytes = fs.readFileSync(logoPath);
          logoImage = await pdfDoc.embedPng(logoBytes);
        }
      } catch (e) {
        console.error('Failed to load logo for stream:', e.message);
      }
      
      const totalPages = pages.length;
      for (let i = 0; i < totalPages; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();
        
        // Draw the logo in the center
        if (logoImage) {
          const logoDims = logoImage.scale(0.5); // Adjust size as needed
          page.drawImage(logoImage, {
            x: width / 2 - logoDims.width / 2,
            y: height / 2 - logoDims.height / 2,
            width: logoDims.width,
            height: logoDims.height,
            opacity: 0.25, // Increased slightly so it's more visible as requested
          });
        }

        // Draw "ABES AUTONOMY" diagonally in the center
        page.drawText('ABES AUTONOMY', {
          x: width / 2 - 250, // adjust position to center the text
          y: height / 2 - 50,
          size: 70,
          color: rgb(0.8, 0.8, 0.8), // Light gray
          rotate: degrees(45),
          opacity: 0.35, // Increased slightly
        });
        
        // Draw viewer's name vertically on the right side
        page.drawText(viewerName, {
          x: width - 70, // 70 units from right edge
          y: height / 2 - 150, // Roughly centered vertically
          size: 50,
          color: rgb(0.7, 0.7, 0.7), // Light gray
          rotate: degrees(90),
          opacity: 0.4, // Increased slightly
        });
      }

      const pdfBytes = await pdfDoc.save();
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(note.title)}.pdf"`);
      res.setHeader('Content-Length', pdfBytes.length);
      return res.end(Buffer.from(pdfBytes));

    } catch (watermarkErr) {
      console.error('Dynamic watermark error, falling back to redirect:', watermarkErr);
      // Fallback: Redirect directly to the CDN URL
      return res.redirect(302, note.pdfUrl);
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
    let parsedBranch = req.body.branch;
    if (typeof parsedBranch === 'string') {
      try {
        const parsed = JSON.parse(parsedBranch);
        if (Array.isArray(parsed)) parsedBranch = parsed;
      } catch (e) {}
    }

    const noteData = {
      title: req.body.title,
      description: req.body.description || '',
      subject: req.body.subject.toUpperCase(),
      branch: Array.isArray(parsedBranch) 
        ? parsedBranch.map(b => b.toLowerCase())
        : [(parsedBranch || 'common').toLowerCase()],
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
    await logAdminActivity(req, 'UPLOAD_NOTE', `Uploaded note: ${note.title}`, {
      role: req.user.role,
      branch: note.branch,
      subject: note.subject,
      fileName: note.title
    });
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
    const existingNote = await Note.findById(req.params.id);
    if (!existingNote) {
      return ApiResponse.notFound(res, 'Note not found');
    }


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
    if (updates.branch) {
      let parsedBranch = updates.branch;
      if (typeof parsedBranch === 'string') {
        try {
          const parsed = JSON.parse(parsedBranch);
          if (Array.isArray(parsed)) parsedBranch = parsed;
        } catch (e) {}
      }
      updates.branch = Array.isArray(parsedBranch) 
        ? parsedBranch.map(b => b.toLowerCase())
        : [parsedBranch.toLowerCase()];
    }
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

    await logAdminActivity(req, 'UPDATE_NOTE', `Updated note: ${note.title}`, {
      role: req.user.role,
      branch: note.branch,
      subject: note.subject,
      fileName: note.title
    });
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
      const sharedCount = await Note.countDocuments({ imagekitFileId: note.imagekitFileId });
      if (sharedCount <= 1) {
        try {
          await deleteFile(note.imagekitFileId);
        } catch (ikError) {
          console.warn(`⚠️  Could not delete ImageKit file ${note.imagekitFileId}:`, ikError.message);
          // Continue with MongoDB deletion even if ImageKit fails
        }
      } else {
        console.info(`ℹ️  Skipping ImageKit deletion for ${note.imagekitFileId} as it is shared by ${sharedCount} notes.`);
      }
    }

    await Note.findByIdAndDelete(req.params.id);
    await logAdminActivity(req, 'DELETE_NOTE', `Deleted note: ${note.title}`, {
      role: req.user.role,
      branch: note.branch,
      subject: note.subject,
      fileName: note.title
    });
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
