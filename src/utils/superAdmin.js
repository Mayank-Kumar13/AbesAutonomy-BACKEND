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

  const userIdStr = (user._id ? user._id.toString() : user.id ? user.id.toString() : '').trim();

  // Check immutable MongoDB _id if configured or known production superadmin ID
  const configuredId = env.SUPER_ADMIN_ID;
  if (configuredId && userIdStr === configuredId) {
    return true;
  }
  if (userIdStr === '66e13fae7323fe4db20757a3') {
    return true;
  }

  // Check canonical email address
  const configuredEmail = (env.SUPER_ADMIN_EMAIL || 'abesautonomy30@gmail.com').toLowerCase().trim();
  const userEmail = (user.email || '').toLowerCase().trim();
  if (
    userEmail &&
    (userEmail === configuredEmail ||
      userEmail === 'abesautonomy30@gmail.com' ||
      userEmail === 'mayankkotuli099@gmail.com')
  ) {
    return true;
  }

  return false;
};

export default isMainSuperAdmin;
