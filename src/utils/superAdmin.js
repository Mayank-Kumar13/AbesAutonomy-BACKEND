import env from '../config/env.js';

/**
 * Server-side check for the ONE designated MAIN ABES AUTONOMY ADMIN account.
 * Having role === 'admin' or 'coordinator' does NOT qualify.
 * Only the specific account identified by SUPER_ADMIN_ID or canonical SUPER_ADMIN_EMAIL gets the exemption.
 * 
 * @param {object} user - The mongoose user instance or user payload
 * @returns {boolean}
 */
export const isMainSuperAdmin = (user) => {
  if (!user) return false;

  // Check immutable MongoDB _id if configured
  const configuredId = env.SUPER_ADMIN_ID;
  if (configuredId) {
    const userIdStr = (user._id ? user._id.toString() : user.id ? user.id.toString() : '').trim();
    if (userIdStr && userIdStr === configuredId) {
      return true;
    }
  }

  // Check canonical email address
  const configuredEmail = (env.SUPER_ADMIN_EMAIL || 'abesautonomy30@gmail.com').toLowerCase().trim();
  const userEmail = (user.email || '').toLowerCase().trim();
  if (userEmail && userEmail === configuredEmail) {
    return true;
  }

  return false;
};

export default isMainSuperAdmin;
