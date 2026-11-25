import env from '../config/env.js';

export const MAIN_ADMIN_EMAIL = 'abesautonomy30@gmail.com';
export const MAIN_ADMIN_ID = '6a777d72c436e8e3e66ee1e5';

/**
 * Server-side check for the ONE designated MAIN ABES AUTONOMY ADMIN account
 * (`abesautonomy30@gmail.com`).
 * Having role === 'admin' or 'coordinator' does NOT qualify.
 * Only the canonical `abesautonomy30@gmail.com` account (or explicitly matching SUPER_ADMIN_ID) qualifies.
 * 
 * @param {object} user - The mongoose user instance or user payload
 * @returns {boolean}
 */
export const isMainSuperAdmin = (user) => {
  if (!user) return false;

  const userIdStr = (user._id ? user._id.toString() : user.id ? user.id.toString() : '').trim();

  // Check immutable MongoDB _id if configured or known production main admin ID
  const configuredId = env.SUPER_ADMIN_ID?.trim();
  if (configuredId && userIdStr === configuredId) {
    return true;
  }
  if (userIdStr === MAIN_ADMIN_ID) {
    return true;
  }

  // Strictly match ONLY the canonical main admin email address
  const userEmail = (user.email || '').toLowerCase().trim();
  if (userEmail && userEmail === MAIN_ADMIN_EMAIL) {
    return true;
  }

  return false;
};

export default isMainSuperAdmin;
