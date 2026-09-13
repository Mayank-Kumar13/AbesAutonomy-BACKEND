import AdminActivity from '../models/AdminActivity.js';

/**
 * Logs an admin activity to the database.
 * @param {Object} req - The Express request object (must contain req.user)
 * @param {String} action - The action enum (e.g., 'DELETE_USER')
 * @param {String} details - Description of what was done
 */
export const logAdminActivity = async (req, action, details, options = {}) => {
  try {
    if (!req.user) {
      console.warn('logAdminActivity: req.user is undefined. Cannot log activity.');
      return;
    }

    const branchStr = Array.isArray(options.branch) ? options.branch.join(', ') : options.branch;

    const activity = new AdminActivity({
      adminId: req.user._id,
      adminName: req.user.name,
      adminEmail: req.user.email,
      action,
      details,
      role: options.role || req.user.role || 'admin',
      branch: branchStr || null,
      subject: options.subject || null,
      fileName: options.fileName || null,
    });

    await activity.save();
  } catch (error) {
    console.error('Failed to log admin activity:', error);
  }
};
