import { getImageKit } from '../config/imagekit.js';

/**
 * Upload a PDF file to ImageKit.
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} fileName - Original file name
 * @param {string} folder - ImageKit folder path
 * @returns {Promise<{url: string, fileId: string, filePath: string, thumbnailUrl: string}>}
 */
export const uploadPdf = async (fileBuffer, fileName, folder = '/notes') => {
  const ik = getImageKit();
  if (!ik) {
    throw new Error('ImageKit is not configured. Please set ImageKit credentials in .env');
  }

  const response = await ik.upload({
    file: fileBuffer,
    fileName: fileName,
    folder: folder,
    tags: ['pdf', 'notes'],
    useUniqueFileName: true,
  });

  return {
    url: response.url,
    fileId: response.fileId,
    filePath: response.filePath,
    thumbnailUrl: response.thumbnailUrl || '',
  };
};

/**
 * Delete a file from ImageKit.
 * @param {string} fileId - ImageKit file ID
 */
export const deleteFile = async (fileId) => {
  const ik = getImageKit();
  if (!ik) {
    throw new Error('ImageKit is not configured.');
  }

  await ik.deleteFile(fileId);
};

/**
 * Get file details from ImageKit.
 * @param {string} fileId - ImageKit file ID
 */
export const getFileDetails = async (fileId) => {
  const ik = getImageKit();
  if (!ik) {
    throw new Error('ImageKit is not configured.');
  }

  return await ik.getFileDetails(fileId);
};

/**
 * List files in ImageKit (for admin browsing).
 * @param {object} options - Search options
 */
export const listFiles = async (options = {}) => {
  const ik = getImageKit();
  if (!ik) {
    throw new Error('ImageKit is not configured.');
  }

  const searchOptions = {
    fileType: 'non-image',
    limit: options.limit || 20,
    skip: options.skip || 0,
    ...options,
  };

  return await ik.listFiles(searchOptions);
};

export default {
  uploadPdf,
  deleteFile,
  getFileDetails,
  listFiles,
};
