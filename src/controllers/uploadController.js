import multer from 'multer';
import Note from '../models/Note.js';
import ApiResponse from '../utils/ApiResponse.js';
import { uploadPdf, deleteFile } from '../services/imagekitService.js';

// ─── Multer configuration ────────────────────────────
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed.'), false);
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
      return ApiResponse.badRequest(res, 'No PDF file provided.');
    }

    // Upload to ImageKit
    let ikResult;
    try {
      const folder = `/notes/${req.body.branch || 'general'}/${req.body.subject || 'misc'}`;
      ikResult = await uploadPdf(req.file.buffer, req.file.originalname, folder);
    } catch (ikError) {
      return ApiResponse.error(res, `ImageKit upload failed: ${ikError.message}`, 502);
    }

    // Create note in MongoDB
    const noteData = {
      title: req.body.title || req.file.originalname.replace('.pdf', ''),
      description: req.body.description || '',
      subject: (req.body.subject || 'GENERAL').toUpperCase(),
      branch: (req.body.branch || 'common').toLowerCase(),
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

    return ApiResponse.created(res, note, 'PDF uploaded and note created successfully');
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

    const noteData = {
      title: title || 'Untitled Note',
      description: description || '',
      subject: (subject || 'GENERAL').toUpperCase(),
      branch: (branch || 'common').toLowerCase(),
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
