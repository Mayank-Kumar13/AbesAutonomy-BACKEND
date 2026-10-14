import User from '../models/User.js';
import ApiResponse from '../utils/ApiResponse.js';

/**
 * POST /api/activity/heartbeat
 * Frontend calls this every ~20s while user is active on the site.
 */
export const heartbeat = async (req, res, next) => {
  try {
    const intervalMs = Math.min(Math.max(parseInt(req.body.intervalMs, 10) || 20000, 1000), 60000);

    const update = { $set: { lastActiveAt: new Date() } };
    // Only exclude master admin ID from watchtime accumulation
    if (req.user?.email?.toLowerCase() !== 'abesautonomy30@gmail.com') {
      update.$inc = { totalWatchTimeMs: intervalMs };
    }

    await User.findByIdAndUpdate(req.user._id, update);

    return ApiResponse.success(res, null, 'ok');
  } catch (error) {
    next(error);
  }
};