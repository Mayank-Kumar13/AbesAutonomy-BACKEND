import User from '../models/User.js';
import LoginLog from '../models/LoginLog.js';
import Review from '../models/Review.js';
import AdminActivity from '../models/AdminActivity.js';
import SuspiciousIP from '../models/SuspiciousIP.js';
import EmailLog from '../models/EmailLog.js';
import EmailQuota from '../models/EmailQuota.js';
import Visitor from '../models/Visitor.js';
import SyntheticVisitor from '../models/SyntheticVisitor.js';
import PdfViewLog from '../models/PdfViewLog.js';
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
      .sort({ createdAt: -1 })
      .lean();

    const now = Date.now();
    const withLiveFlag = users.map((u) => {
      u.isLive = u.lastActiveAt
        ? now - new Date(u.lastActiveAt).getTime() < LIVE_WINDOW_MS
        : false;
      return u;
    });

    // Move master admin to the top
    withLiveFlag.sort((a, b) => {
      if (a.email === 'abesautonomy30@gmail.com') return -1;
      if (b.email === 'abesautonomy30@gmail.com') return 1;
      return 0; // maintain existing sort for others
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
    const logs = await LoginLog.find().sort({ createdAt: -1 }).limit(limit).lean();
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
    const user = await User.findById(id);

    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }

    if (user.email === 'abesautonomy30@gmail.com') {
      return ApiResponse.forbidden(res, 'Cannot delete the master admin account');
    }

    await User.findByIdAndDelete(id);
    
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

    if (user.email === 'abesautonomy30@gmail.com' && role !== 'admin') {
      return ApiResponse.forbidden(res, 'Cannot demote the master admin account');
    }

    const previousRole = user.role;

    // Only master admin can grant admin role
    if (role === 'admin' && previousRole !== 'admin' && req.user.email !== 'abesautonomy30@gmail.com') {
      return ApiResponse.forbidden(res, 'Only the master admin can grant the admin role to others.');
    }

    // Only master admin can revoke admin role
    if (previousRole === 'admin' && role !== 'admin' && req.user.email !== 'abesautonomy30@gmail.com') {
      return ApiResponse.forbidden(res, 'Only the master admin can revoke the admin role from another admin.');
    }

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
    const activities = await AdminActivity.find().sort({ createdAt: -1 }).limit(limit).lean();
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
    const ips = await SuspiciousIP.find().sort({ updatedAt: -1 }).limit(limit).lean();
    return ApiResponse.success(res, ips);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/suspicious-ips
 */
export const clearSuspiciousIPs = async (req, res, next) => {
  try {
    await SuspiciousIP.deleteMany({});
    return ApiResponse.success(res, null, 'All blocked/suspicious IPs have been cleared.');
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

/**
 * GET /api/admin/top-readers
 * Returns top reading students in specified timeframe (default: 24h),
 * with top 3 readers podium, top 10 breakdown, total reading duration, and list of PDFs read.
 */
export const getTopReaders = async (req, res, next) => {
  try {
    const timeframe = req.query.timeframe || '24h';
    let since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (timeframe === '7d') {
      since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe === '30d') {
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeframe === 'all') {
      since = new Date(0);
    }

    const readersAgg = await PdfViewLog.aggregate([
      { $match: { endTime: { $gte: since } } },
      {
        $addFields: {
          effectiveDuration: {
            $cond: [
              { $gt: ['$durationMs', 0] },
              '$durationMs',
              { $max: [0, { $subtract: ['$endTime', '$startTime'] }] }
            ]
          }
        }
      },
      // Group by user & individual PDF to aggregate time spent on each specific PDF
      {
        $group: {
          _id: { userId: '$user', pdfTitle: '$pdfTitle' },
          userName: { $first: '$userName' },
          userEmail: { $first: '$userEmail' },
          subject: { $first: '$subject' },
          pdfId: { $first: '$pdfId' },
          pdfDurationMs: { $sum: '$effectiveDuration' },
          sessionsCount: { $sum: 1 },
          lastReadAt: { $max: '$endTime' }
        }
      },
      // Group by user to aggregate overall read time and collect all PDFs read
      {
        $group: {
          _id: '$_id.userId',
          userName: { $first: '$userName' },
          userEmail: { $first: '$userEmail' },
          totalReadTimeMs: { $sum: '$pdfDurationMs' },
          totalPdfsCount: { $sum: 1 },
          lastActiveAt: { $max: '$lastReadAt' },
          pdfsRead: {
            $push: {
              pdfTitle: '$_id.pdfTitle',
              subject: '$subject',
              pdfId: '$pdfId',
              durationMs: '$pdfDurationMs',
              sessionsCount: '$sessionsCount',
              lastReadAt: '$lastReadAt'
            }
          }
        }
      },
      // Lookup actual User details from User collection
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDoc'
        }
      },
      {
        $addFields: {
          userObj: { $arrayElemAt: ['$userDoc', 0] }
        }
      },
      // Exclude admin accounts to reflect genuine student readership
      {
        $match: {
          $or: [
            { 'userObj.role': { $exists: false } },
            { 'userObj.role': { $ne: 'admin' } }
          ]
        }
      },
      {
        $project: {
          userId: '$_id',
          name: { $ifNull: ['$userObj.name', '$userName'] },
          email: { $ifNull: ['$userObj.email', '$userEmail'] },
          profilePicture: '$userObj.profilePicture',
          role: '$userObj.role',
          totalReadTimeMs: 1,
          totalPdfsCount: 1,
          lastActiveAt: 1,
          totalAllTimeWatchTimeMs: '$userObj.totalWatchTimeMs',
          pdfsRead: 1
        }
      },
      { $sort: { totalReadTimeMs: -1, lastActiveAt: -1 } },
      { $limit: 10 }
    ]);

    // Sort nested pdfsRead array by duration descending for each student
    const formattedReaders = readersAgg.map((reader, index) => {
      const sortedPdfs = (reader.pdfsRead || []).sort(
        (a, b) => (b.durationMs || 0) - (a.durationMs || 0)
      );
      return {
        rank: index + 1,
        ...reader,
        pdfsRead: sortedPdfs
      };
    });

    const top3 = formattedReaders.slice(0, 3);
    const top10 = formattedReaders.slice(0, 10);

    // Summary calculation
    const totalReadingTimeMs = formattedReaders.reduce((acc, r) => acc + (r.totalReadTimeMs || 0), 0);
    const uniquePdfsSet = new Set();
    formattedReaders.forEach(r => (r.pdfsRead || []).forEach(p => p.pdfTitle && uniquePdfsSet.add(p.pdfTitle)));

    return ApiResponse.success(res, {
      timeframe,
      since,
      summary: {
        totalReadingTimeMs,
        activeReadersCount: formattedReaders.length,
        uniquePdfsReadCount: uniquePdfsSet.size
      },
      top3,
      top10
    });
  } catch (error) {
    next(error);
  }
};