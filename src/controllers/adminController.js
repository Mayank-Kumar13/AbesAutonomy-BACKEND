import User from '../models/User.js';
import LoginLog from '../models/LoginLog.js';
import Review from '../models/Review.js';
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

/**
 * GET /api/admin/reviews
 */
export const getReviews = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find()
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(),
    ]);

    return ApiResponse.paginated(res, reviews, page, limit, total);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/reviews/:id
 */
export const deleteReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const review = await Review.findByIdAndDelete(id);

    if (!review) {
      return ApiResponse.notFound(res, 'Review not found');
    }

    return ApiResponse.success(res, null, 'Review deleted successfully by admin');
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/users/:id
 */
export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }

    return ApiResponse.success(res, null, 'User deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/users/:id/role
 */
export const updateUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return ApiResponse.badRequest(res, 'Invalid role specified');
    }

    const user = await User.findByIdAndUpdate(id, { role }, { new: true, runValidators: true });

    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }

    return ApiResponse.success(res, user.toSafeJSON(), 'User role updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/logs
 */
export const clearLogs = async (req, res, next) => {
  try {
    await LoginLog.deleteMany({});
    return ApiResponse.success(res, null, 'All login logs cleared successfully');
  } catch (error) {
    next(error);
  }
};