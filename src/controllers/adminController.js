import User from '../models/User.js';
import LoginLog from '../models/LoginLog.js';
import ApiResponse from '../utils/ApiResponse.js';

const LIVE_WINDOW_MS = 5 * 60 * 1000; // active in last 5 min = "live"

/**
 * GET /api/admin/stats
 */
export const getStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const liveUsers = await User.countDocuments({
      lastActiveAt: { $gte: new Date(Date.now() - LIVE_WINDOW_MS) },
    });
    const verifiedUsers = await User.countDocuments({ emailVerified: true });

    const watchAgg = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$totalWatchTimeMs' } } },
    ]);
    const totalWatchTimeMs = watchAgg[0]?.total || 0;

    return ApiResponse.success(res, {
      totalUsers,
      liveUsers,
      verifiedUsers,
      totalWatchTimeMs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/users
 */
export const getUsers = async (req, res, next) => {
  try {
    const users = await User.find()
      .select('name email role provider emailVerified lastLogin lastActiveAt loginCount totalWatchTimeMs createdAt')
      .sort({ createdAt: -1 });

    const now = Date.now();
    const withLiveFlag = users.map((u) => {
      const obj = u.toObject();
      obj.isLive = obj.lastActiveAt
        ? now - new Date(obj.lastActiveAt).getTime() < LIVE_WINDOW_MS
        : false;
      return obj;
    });

    return ApiResponse.success(res, withLiveFlag);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/logs
 */
export const getLogs = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const logs = await LoginLog.find().sort({ createdAt: -1 }).limit(limit);
    return ApiResponse.success(res, logs);
  } catch (error) {
    next(error);
  }
};