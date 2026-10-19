import { getSupabase, BUCKET_NAME, isSupabaseConfigured } from '../config/supabase.js';

/**
 * Deterministically map an ImageKit URL or file path to a Supabase Storage path.
 * Example:
 *   "https://ik.imagekit.io/dfkux2rsp/notes/cse/MATHS/Unit_1.pdf" -> "notes/cse/MATHS/Unit_1.pdf"
 *   "/notes/cse/MATHS/Unit_1.pdf" -> "notes/cse/MATHS/Unit_1.pdf"
 */
export const mapImageKitUrlToSupabasePath = (urlOrPath) => {
  if (!urlOrPath || typeof urlOrPath !== 'string') return '';

  let clean = urlOrPath.split('?')[0].split('#')[0].trim();

  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    try {
      const parsed = new URL(clean);
      const segments = parsed.pathname.split('/').filter(Boolean);

      // Remove ImageKit ID prefix if present
      if (segments.length > 0 && segments[0] !== 'notes') {
        segments.shift();
      }

      const filtered = segments.filter((seg) => !seg.startsWith('tr:'));
      return filtered.join('/');
    } catch {
      // Ignore URL parse error and fall back
    }
  }

  return clean.replace(/^\/+/, '');
};

/**
 * Upload a Buffer to Supabase Storage in the 'pdfs' bucket
 * @param {Buffer} buffer
 * @param {string} filePath
 * @param {string} contentType
 * @param {boolean} upsert
 * @returns {Promise<{path: string, url: string}>}
 */
export const uploadBuffer = async (buffer, filePath, contentType = 'application/pdf', upsert = false) => {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase Storage is not configured in backend environment.');
  }

  const cleanPath = filePath.replace(/^\/+/, '');

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(cleanPath, buffer, {
      contentType,
      upsert,
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(`Supabase upload error: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path);

  return {
    path: data.path,
    url: urlData?.publicUrl || '',
  };
};

/**
 * Download a file from Supabase Storage as a Buffer
 * @param {string} filePath
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
export const downloadBuffer = async (filePath) => {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase Storage is not configured in backend.');
  }

  const cleanPath = filePath.replace(/^\/+/, '');
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(cleanPath);

  if (error) {
    throw new Error(`Supabase download error: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: data.type || 'application/pdf',
  };
};

/**
 * Check if a file exists in Supabase Storage
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
export const fileExistsInSupabase = async (filePath) => {
  const supabase = getSupabase();
  if (!supabase) return false;

  const cleanPath = filePath.replace(/^\/+/, '');
  const parts = cleanPath.split('/');
  const fileName = parts.pop();
  const folder = parts.join('/');

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folder, { search: fileName, limit: 1 });

    if (error || !data) return false;
    return data.some((item) => item.name === fileName);
  } catch {
    return false;
  }
};

/**
 * Get public URL for a file in Supabase Storage
 * @param {string} filePath
 */
export const getSupabasePublicUrl = (filePath) => {
  const supabase = getSupabase();
  if (!supabase || !filePath) return '';

  const cleanPath = filePath.replace(/^\/+/, '');
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(cleanPath);
  return data?.publicUrl || '';
};

/**
 * Safely copy a file from ImageKit into Supabase Storage.
 * Does not overwrite if already present unless force=true.
 *
 * @param {string} imagekitUrl
 * @param {string} targetFilePath
 * @param {boolean} force
 */
export const syncImageKitFileToSupabase = async (imagekitUrl, targetFilePath = '', force = false) => {
  if (!isSupabaseConfigured()) {
    return { success: false, reason: 'Supabase not configured' };
  }

  const destinationPath = targetFilePath || mapImageKitUrlToSupabasePath(imagekitUrl);
  if (!destinationPath) {
    return { success: false, reason: 'Invalid destination path' };
  }

  if (!force) {
    const exists = await fileExistsInSupabase(destinationPath);
    if (exists) {
      const publicUrl = getSupabasePublicUrl(destinationPath);
      return { success: true, path: destinationPath, url: publicUrl, alreadyExisted: true };
    }
  }

  // Fetch the file from ImageKit
  const res = await fetch(imagekitUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch file from ImageKit: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || 'application/pdf';
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  const result = await uploadBuffer(buffer, destinationPath, contentType, force);
  return {
    success: true,
    path: result.path,
    url: result.url,
    alreadyExisted: false,
  };
};

export { isSupabaseConfigured };

export default {
  isSupabaseConfigured,
  mapImageKitUrlToSupabasePath,
  uploadBuffer,
  downloadBuffer,
  fileExistsInSupabase,
  getSupabasePublicUrl,
  syncImageKitFileToSupabase,
};
