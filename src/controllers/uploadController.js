import multer from 'multer';
import Note from '../models/Note.js';
import ApiResponse from '../utils/ApiResponse.js';
import { uploadPdf, deleteFile } from '../services/imagekitService.js';
import { logAdminActivity } from '../utils/logger.js';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Multer configuration ────────────────────────────
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and image files are allowed.'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

/**
 * POST /api/upload/pdf
 * Upload a PDF to ImageKit and create a note.
 */
export const uploadPdfAndCreateNote = async (req, res, next) => {
  try {
    if (!req.file) {
      return ApiResponse.badRequest(res, 'No file provided.');
    }

    if (!req.body.title || req.body.title.trim() === '') {
      return ApiResponse.badRequest(res, 'Title is required.');
    }

    if (!req.body.subject || req.body.subject.trim() === '') {
      return ApiResponse.badRequest(res, 'Subject is required.');
    }

    let parsedBranch = req.body.branch;
    if (typeof parsedBranch === 'string') {
      try {
        const parsed = JSON.parse(parsedBranch);
        if (Array.isArray(parsed)) parsedBranch = parsed;
      } catch (e) {
        // Not a JSON string, leave as string
      }
    }

    if (!parsedBranch || (typeof parsedBranch === 'string' && parsedBranch.trim() === '') || (Array.isArray(parsedBranch) && parsedBranch.length === 0)) {
      return ApiResponse.badRequest(res, 'Branch is required.');
    }

    if (!req.body.resourceType || req.body.resourceType.trim() === '') {
      return ApiResponse.badRequest(res, 'Resource type is required.');
    }

    // Validate File Size
    if (req.file.size > 50 * 1024 * 1024) {
      return ApiResponse.badRequest(res, 'File size exceeds the 50MB limit.');
    }

    // Validate PDF magic bytes
    if (req.file.mimetype === 'application/pdf') {
      const magicBytes = req.file.buffer.toString('hex', 0, 4);
      // %PDF in hex is 25504446
      if (magicBytes !== '25504446') {
        return ApiResponse.badRequest(res, 'Invalid PDF file structure or signature.');
      }
    }

    // Sanitize filename
    const sanitizedFilename = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '');
    if (!sanitizedFilename) {
      return ApiResponse.badRequest(res, 'Invalid filename.');
    }

    // Upload to ImageKit
    let ikResult;
    try {
      // Apply Watermark
      let finalBuffer = req.file.buffer;


      const primaryBranch = Array.isArray(parsedBranch) ? parsedBranch[0] : (parsedBranch || 'general');
      const folder = `/notes/${primaryBranch.toLowerCase()}/${req.body.subject.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      ikResult = await uploadPdf(finalBuffer, sanitizedFilename, folder);
    } catch (ikError) {
      console.error('ImageKit upload error:', ikError);
      return ApiResponse.error(res, `ImageKit upload failed: ${ikError.message || 'Please verify configuration.'}`, 502);
    }

    // Create note in MongoDB
    const noteData = {
      title: req.body.title.trim(),
      description: req.body.description || '',
      subject: req.body.subject.trim().toUpperCase(),
      branch: Array.isArray(parsedBranch) 
        ? parsedBranch.map(b => b.toLowerCase()) 
        : [(parsedBranch || 'common').toLowerCase()],
      year: parseInt(req.body.year, 10) || 1,
      resourceType: (req.body.resourceType || 'theory').toLowerCase(),
      semester: req.body.semester ? parseInt(req.body.semester, 10) : undefined,
      unit: req.body.unit ? parseInt(req.body.unit, 10) : undefined,
      tags: req.body.tags ? JSON.parse(req.body.tags) : [],
      pdfUrl: ikResult.url,
      imagekitFileId: ikResult.fileId,
      imagekitFilePath: ikResult.filePath,
      thumbnailUrl: ikResult.thumbnailUrl,
      uploadedBy: req.user?._id,
    };

    const note = await Note.create(noteData);

    await logAdminActivity(req, 'UPLOAD_NOTE', `Uploaded note: ${note.title}`, {
      role: req.user.role,
      branch: note.branch,
      subject: note.subject,
      fileName: note.title
    });

    return ApiResponse.created(res, note, 'File uploaded and note created successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/upload/register
 * Register an existing ImageKit PDF in MongoDB (no upload needed).
 */
export const registerExistingPdf = async (req, res, next) => {
  try {
    const {
      title, description, subject, branch, year,
      resourceType, semester, unit, tags,
      pdfUrl, imagekitFileId, imagekitFilePath, thumbnailUrl,
    } = req.body;

    if (!pdfUrl) {
      return ApiResponse.badRequest(res, 'PDF URL is required.');
    }

    if (!title || title.trim() === '') {
      return ApiResponse.badRequest(res, 'Title is required.');
    }

    if (!subject || subject.trim() === '') {
      return ApiResponse.badRequest(res, 'Subject is required.');
    }

    let parsedBranch = branch;
    if (typeof parsedBranch === 'string') {
      try {
        const parsed = JSON.parse(parsedBranch);
        if (Array.isArray(parsed)) parsedBranch = parsed;
      } catch (e) {
        // Not a JSON string
      }
    }

    if (!parsedBranch || (typeof parsedBranch === 'string' && parsedBranch.trim() === '') || (Array.isArray(parsedBranch) && parsedBranch.length === 0)) {
      return ApiResponse.badRequest(res, 'Branch is required.');
    }

    if (!resourceType || resourceType.trim() === '') {
      return ApiResponse.badRequest(res, 'Resource type is required.');
    }

    const noteData = {
      title: title.trim(),
      description: description || '',
      subject: subject.trim().toUpperCase(),
      branch: Array.isArray(parsedBranch)
        ? parsedBranch.map(b => b.toLowerCase())
        : [(parsedBranch || 'common').toLowerCase()],
      year: parseInt(year, 10) || 1,
      resourceType: (resourceType || 'theory').toLowerCase(),
      semester: semester ? parseInt(semester, 10) : undefined,
      unit: unit ? parseInt(unit, 10) : undefined,
      tags: tags || [],
      pdfUrl,
      imagekitFileId: imagekitFileId || '',
      imagekitFilePath: imagekitFilePath || '',
      thumbnailUrl: thumbnailUrl || '',
      uploadedBy: req.user?._id,
    };

    const note = await Note.create(noteData);

    await logAdminActivity(req, 'UPLOAD_NOTE', `Registered existing note: ${note.title}`, {
      role: req.user.role,
      branch: note.branch,
      subject: note.subject,
      fileName: note.title
    });

    return ApiResponse.created(res, note, 'Existing PDF registered successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/upload/:fileId
 * Delete a file from ImageKit (does NOT delete the MongoDB note).
 */
export const deleteImageKitFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    try {
      await deleteFile(fileId);
    } catch (ikError) {
      return ApiResponse.error(res, `ImageKit delete failed: ${ikError.message}`, 502);
    }

    // Optionally clear the ImageKit reference from any note that has this fileId
    await Note.updateMany(
      { imagekitFileId: fileId },
      { $set: { imagekitFileId: '', imagekitFilePath: '' } }
    );

    return ApiResponse.success(res, null, 'File deleted from ImageKit');
  } catch (error) {
    next(error);
  }
};
