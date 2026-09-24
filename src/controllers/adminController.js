import User from '../models/User.js';
import LoginLog from '../models/LoginLog.js';
import Review from '../models/Review.js';
import AdminActivity from '../models/AdminActivity.js';
import SuspiciousIP from '../models/SuspiciousIP.js';
import EmailLog from '../models/EmailLog.js';
import EmailQuota from '../models/EmailQuota.js';
import Visitor from '../models/Visitor.js';
import SyntheticVisitor from '../models/SyntheticVisitor.js';
import { logAdminActivity } from '../utils/logger.js';
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
    const totalVisitors = await Visitor.countDocuments();

    const watchAgg = await User.aggregate([
      { $match: { role: { $ne: 'admin' } } },
      { $group: { _id: null, total: { $sum: '$totalWatchTimeMs' } } },
    ]);
    const totalWatchTimeMs = watchAgg[0]?.total || 0;

    // Synthetic Load Test Stats
    const syntheticVisitors = await SyntheticVisitor.countDocuments();
    const syntheticReqAgg = await SyntheticVisitor.aggregate([
      { $group: { _id: null, total: { $sum: '$visitCount' }, lastActive: { $max: '$lastVisit' } } },
    ]);
    const syntheticRequests = syntheticReqAgg[0]?.total || 0;
    const syntheticLastActive = syntheticReqAgg[0]?.lastActive || null;

    return ApiResponse.success(res, {
      totalUsers,
      liveUsers,
      verifiedUsers,
      totalWatchTimeMs,
      totalVisitors,
      syntheticVisitors,
      syntheticRequests,
      syntheticLastActive,
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
      .select('name email role assignedBranches provider emailVerified lastLogin lastActiveAt loginCount totalWatchTimeMs createdAt')
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
    
    await logAdminActivity(req, 'DELETE_REVIEW', `Deleted review by ${review.displayName || 'unknown'}`);

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
    
    await logAdminActivity(req, 'DELETE_USER', `Deleted user ${user.email}`);

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

    if (!['user', 'admin', 'coordinator'].includes(role)) {
      return ApiResponse.badRequest(res, 'Invalid role specified');
    }

    const user = await User.findById(id);
    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }

    const previousRole = user.role;

    user.role = role;
    user.assignedBranches = [];
    await user.save();

    if (role === 'coordinator' && previousRole !== 'coordinator') {
      await logAdminActivity(req, 'UPDATE_ROLE', `Assigned coordinator to ${user.email}`, { role: user.role });
    } else {
      await logAdminActivity(req, 'UPDATE_ROLE', `Updated role of ${user.email} to ${role}`, { role: user.role });
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
    await logAdminActivity(req, 'CLEAR_LOGS', 'Cleared all login logs');
    return ApiResponse.success(res, null, 'All login logs cleared successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/activities
 */
export const getAdminActivities = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const activities = await AdminActivity.find().sort({ createdAt: -1 }).limit(limit);
    return ApiResponse.success(res, activities);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/suspicious-ips
 */
export const getSuspiciousIPs = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const ips = await SuspiciousIP.find().sort({ updatedAt: -1 }).limit(limit);
    return ApiResponse.success(res, ips);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/email-logs
 */
export const getEmailLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [{ recipient: searchRegex }, { subject: searchRegex }];
    }
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.template) {
      query.template = req.query.template;
    }

    const [logs, total] = await Promise.all([
      EmailLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      EmailLog.countDocuments(query),
    ]);

    return ApiResponse.paginated(res, logs, page, limit, total);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/email-quota
 */
export const getEmailQuota = async (req, res, next) => {
  try {
    let quota = await EmailQuota.findOne();
    if (!quota) {
      // Return a default structure if not yet created by the email service
      quota = {
        dailyLimit: process.env.DAILY_EMAIL_LIMIT || 300,
        usedToday: 0,
        sent: 0,
        failed: 0,
        blocked: 0,
        lastReset: new Date()
      };
    }
    return ApiResponse.success(res, quota);
  } catch (error) {
    next(error);
  }
};