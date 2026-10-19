import { Readable } from 'stream';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import Note from '../models/Note.js';
import ApiResponse from '../utils/ApiResponse.js';
import { getFilteredNotes, searchNotes } from '../services/noteService.js';
import { deleteFile } from '../services/imagekitService.js';
import { downloadBuffer, isSupabaseConfigured, mapImageKitUrlToSupabasePath } from '../services/supabaseStorageService.js';
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
      .select('-imagekitFileId -imagekitFilePath')
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
    if (!note || (!note.pdfUrl && !note.supabaseUrl && !note.supabasePath)) {
      return res.status(404).send('PDF not found');
    }

    let streamBody = null;
    let contentType = 'application/pdf';

    // 1. Try Primary provider (ImageKit via note.pdfUrl)
    if (note.pdfUrl) {
      try {
        const primaryRes = await fetch(note.pdfUrl);
        if (primaryRes.ok) {
          contentType = primaryRes.headers.get('content-type') || 'application/pdf';
          streamBody = Readable.fromWeb(primaryRes.body);
        } else {
          console.warn(`[StreamNotePdf] Primary CDN fetch returned ${primaryRes.status}. Attempting Supabase fallback...`);
        }
      } catch (primaryErr) {
        console.warn(`[StreamNotePdf] Primary CDN fetch error: ${primaryErr.message}. Attempting Supabase fallback...`);
      }
    }

    // 2. Try Fallback provider (Supabase Storage) if primary failed
    if (!streamBody && isSupabaseConfigured()) {
      const sbPath = note.supabasePath || mapImageKitUrlToSupabasePath(note.pdfUrl);
      if (sbPath) {
        try {
          const { buffer, contentType: sbType } = await downloadBuffer(sbPath);
          contentType = sbType || 'application/pdf';
          streamBody = Readable.from(buffer);
          console.info(`[StreamNotePdf] Successfully streaming from Supabase Storage fallback: ${sbPath}`);
        } catch (sbErr) {
          console.warn(`[StreamNotePdf] Supabase fallback download failed: ${sbErr.message}`);
        }
      }
    }

    if (!streamBody) {
      return res.status(502).send('Unable to retrieve document from primary or backup storage.');
    }

    res.setHeader('Content-Type', contentType);
    let ext = 'pdf';
    if (contentType === 'image/jpeg') ext = 'jpg';
    else if (contentType === 'image/png') ext = 'png';
    else if (contentType === 'image/webp') ext = 'webp';

    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(note.title)}.${ext}"`);
    streamBody.pipe(res);
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
    if (!note || (!note.pdfUrl && !note.supabaseUrl && !note.supabasePath)) {
      return res.status(404).send('PDF not found');
    }

    // Safely increment download count in background
    Note.findByIdAndUpdate(note._id, { $inc: { downloadCount: 1 } }).exec().catch(() => {});

    let arrayBuffer = null;
    let contentType = 'application/pdf';

    // 1. Fetch from Primary ImageKit
    if (note.pdfUrl) {
      try {
        const response = await fetch(note.pdfUrl);
        if (response.ok) {
          contentType = response.headers.get('content-type') || 'application/pdf';
          arrayBuffer = await response.arrayBuffer();
        } else {
          console.warn(`[DownloadNotePdf] Primary fetch returned ${response.status}. Attempting Supabase fallback...`);
        }
      } catch (err) {
        console.warn(`[DownloadNotePdf] Primary fetch error: ${err.message}. Attempting Supabase fallback...`);
      }
    }

    // 2. Fetch from Supabase Storage fallback if primary failed
    if (!arrayBuffer && isSupabaseConfigured()) {
      const sbPath = note.supabasePath || mapImageKitUrlToSupabasePath(note.pdfUrl);
      if (sbPath) {
        try {
          const { buffer, contentType: sbType } = await downloadBuffer(sbPath);
          contentType = sbType || 'application/pdf';
          arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
          console.info(`[DownloadNotePdf] Successfully retrieved buffer from Supabase fallback: ${sbPath}`);
        } catch (sbErr) {
          console.warn(`[DownloadNotePdf] Supabase fallback download failed: ${sbErr.message}`);
        }
      }
    }

    if (!arrayBuffer) {
      return res.status(502).send('Failed to fetch document for download from both storage providers.');
    }

    // Apply dynamic watermark if it's a PDF
    try {
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      pages.forEach((page) => {
        const { width, height } = page.getSize();
        page.drawText('ABES Autonomy', {
          x: width / 2 - 170,
          y: height / 2,
          size: 60,
          font: helveticaFont,
          color: rgb(0.6, 0.6, 0.6),
          opacity: 0.3,
          rotate: degrees(45),
        });
      });

      const pdfBytes = await pdfDoc.save();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${(note.title || 'document').replace(/[^a-zA-Z0-9.-]/g, '_')}.pdf"`);
      return res.send(Buffer.from(pdfBytes));
    } catch (watermarkError) {
      console.warn('Watermarking error, returning raw file buffer:', watermarkError.message);
      let ext = 'pdf';
      if (contentType === 'image/jpeg') ext = 'jpg';
      else if (contentType === 'image/png') ext = 'png';
      else if (contentType === 'image/webp') ext = 'webp';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${(note.title || 'document').replace(/[^a-zA-Z0-9.-]/g, '_')}.${ext}"`);
      return res.send(Buffer.from(arrayBuffer));
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
      isPublished: req.user?.role === 'admin',
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
