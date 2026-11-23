import User from '../models/User.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import AdminNotification from '../models/AdminNotification.js';
import AdminAuditLog from '../models/AdminAuditLog.js';
import PDFAccessLog from '../models/PDFAccessLog.js';
import AIUsageLog from '../models/AIUsageLog.js';
import ApiResponse from '../utils/ApiResponse.js';
import { activateOrExtendSubscription, SUBSCRIPTION_PLANS } from '../services/paymentService.js';
import { isMainSuperAdmin } from '../utils/superAdmin.js';

/**
 * GET /api/admin/premium/analytics
 * Provides complete high-level Premium and Revenue metrics.
 */
export const getPremiumAnalytics = async (req, res, next) => {
  try {
    const now = new Date();

    const [
      totalUsers,
      activePremiumUsers,
      expiredUsers,
      totalPayments,
      plan2mCount,
      plan4mCount,
      recentTransactions,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isPremium: true, premiumExpiryDate: { $gt: now } }),
      User.countDocuments({ premiumStatus: 'EXPIRED' }),
      Payment.aggregate([
        {
          $group: {
            _id: '$status',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      Payment.countDocuments({ status: 'captured', plan: 'premium_2_months' }),
      Payment.countDocuments({ status: 'captured', plan: 'premium_4_months' }),
      Payment.find().sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    const capturedStats = totalPayments.find((p) => p._id === 'captured') || { totalAmount: 0, count: 0 };
    const failedStats = totalPayments.find((p) => p._id === 'failed') || { totalAmount: 0, count: 0 };
    const refundedStats = totalPayments.find((p) => p._id === 'refunded') || { totalAmount: 0, count: 0 };

    const totalRevenueRupees = Math.round(capturedStats.totalAmount / 100);
    const freeUsers = Math.max(0, totalUsers - activePremiumUsers);
    const conversionRate = totalUsers > 0 ? ((activePremiumUsers / totalUsers) * 100).toFixed(2) : 0;

    return ApiResponse.success(res, {
      totalUsers,
      activePremiumUsers,
      expiredUsers,
      freeUsers,
      totalRevenueRupees,
      successfulPaymentsCount: capturedStats.count,
      failedPaymentsCount: failedStats.count,
      refundedPaymentsCount: refundedStats.count,
      plan2mSales: plan2mCount,
      plan4mSales: plan4mCount,
      conversionRate: `${conversionRate}%`,
      recentTransactions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/premium/users
 * Search and list users with their subscription details.
 */
export const getPremiumUsers = async (req, res, next) => {
  try {
    const { q, status, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }

    const now = new Date();
    if (status === 'active') {
      filter.isPremium = true;
      filter.premiumExpiryDate = { $gt: now };
    } else if (status === 'expired') {
      filter.$or = [
        { premiumStatus: 'EXPIRED' },
        { isPremium: true, premiumExpiryDate: { $lte: now } },
      ];
    } else if (status === 'free') {
      filter.isPremium = false;
      filter.premiumStatus = { $ne: 'EXPIRED' };
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('name email role provider isPremium premiumPlan premiumStartDate premiumExpiryDate premiumStatus freePdfAccessCount createdAt')
        .sort({ isPremium: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
    ]);

    const enrichedUsers = users.map((u) => {
      const isSubActive = u.isPremium && u.premiumExpiryDate && new Date(u.premiumExpiryDate) > now;
      let daysRemaining = 0;
      if (isSubActive) {
        daysRemaining = Math.max(0, Math.ceil((new Date(u.premiumExpiryDate) - now) / 86400000));
      }
      return {
        ...u,
        isSuperAdmin: isMainSuperAdmin(u),
        isActivelyPremium: isSubActive,
        daysRemaining,
        freeRemaining: Math.max(0, 3 - (u.freePdfAccessCount || 0)),
      };
    });

    return ApiResponse.paginated(res, enrichedUsers, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/premium/users/:id/details
 * Retrieve complete subscription, payment, and activity history for a specific user.
 */
export const getUserSubscriptionDetails = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .lean();

    if (!user) return ApiResponse.notFound(res, 'User not found.');

    const [payments, subscriptions, pdfLogs, aiLogs] = await Promise.all([
      Payment.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
      Subscription.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
      PDFAccessLog.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
      AIUsageLog.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);

    return ApiResponse.success(res, {
      user: {
        ...user,
        isSuperAdmin: isMainSuperAdmin(user),
      },
      payments,
      subscriptions,
      pdfLogs,
      aiLogs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/premium/users/:id/manual-activate
 * Manually activate or extend a user's subscription (with audit logging).
 */
export const manualActivateSubscription = async (req, res, next) => {
  try {
    const { plan = 'premium_2_months', customDays, reason = 'Admin manual grant' } = req.body;
    const targetUserId = req.params.id;

    const { user, subscription, previousState } = await activateOrExtendSubscription(
      targetUserId,
      plan,
      null,
      'admin_manual',
      req.user._id,
      customDays ? parseInt(customDays, 10) : null,
      reason
    );

    // Audit Log
    await AdminAuditLog.create({
      action: 'MANUAL_PREMIUM_ACTIVATION',
      adminId: req.user._id,
      adminEmail: req.user.email,
      adminName: req.user.name,
      targetUserId: user._id,
      targetUserEmail: user.email,
      targetUserName: user.name,
      previousValue: previousState,
      newValue: {
        isPremium: user.isPremium,
        premiumPlan: user.premiumPlan,
        premiumExpiryDate: user.premiumExpiryDate,
        premiumStatus: user.premiumStatus,
      },
      reason,
      ip: req.ip || '',
    });

    // Notification
    await AdminNotification.create({
      type: 'MANUAL_ACTIVATION',
      title: 'Manual Premium Activated',
      message: `${req.user.name} granted Premium to ${user.name} (${user.email}). Expiry: ${new Date(user.premiumExpiryDate).toLocaleDateString()}. Reason: ${reason}`,
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
    }).catch(() => {});

    return ApiResponse.success(res, { user, subscription }, 'Premium manually activated.');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/premium/users/:id/extend
 * Extend existing subscription by days.
 */
export const manualExtendSubscription = async (req, res, next) => {
  try {
    const { days = 30, reason = 'Admin manual extension' } = req.body;
    const targetUserId = req.params.id;

    const daysNum = parseInt(days, 10);
    if (!daysNum || daysNum <= 0) {
      return ApiResponse.badRequest(res, 'Valid number of days required.');
    }

    const { user, subscription, previousState } = await activateOrExtendSubscription(
      targetUserId,
      'premium_2_months',
      null,
      'admin_manual',
      req.user._id,
      daysNum,
      reason
    );

    await AdminAuditLog.create({
      action: 'SUBSCRIPTION_EXTENDED',
      adminId: req.user._id,
      adminEmail: req.user.email,
      adminName: req.user.name,
      targetUserId: user._id,
      targetUserEmail: user.email,
      targetUserName: user.name,
      previousValue: previousState,
      newValue: {
        premiumExpiryDate: user.premiumExpiryDate,
        extendedByDays: daysNum,
      },
      reason,
      ip: req.ip || '',
    });

    await AdminNotification.create({
      type: 'SUBSCRIPTION_EXTENDED',
      title: 'Subscription Extended',
      message: `${req.user.name} extended ${user.name}'s subscription by ${daysNum} days. New expiry: ${new Date(user.premiumExpiryDate).toLocaleDateString()}`,
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
    }).catch(() => {});

    return ApiResponse.success(res, { user, subscription }, `Subscription extended by ${daysNum} days.`);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/premium/users/:id/revoke
 * Revoke user's active Premium subscription.
 */
export const manualRevokeSubscription = async (req, res, next) => {
  try {
    const { reason = 'Revoked by admin' } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return ApiResponse.notFound(res, 'User not found.');

    const previousState = {
      isPremium: user.isPremium,
      premiumPlan: user.premiumPlan,
      premiumExpiryDate: user.premiumExpiryDate,
      premiumStatus: user.premiumStatus,
    };

    user.isPremium = false;
    user.premiumStatus = 'EXPIRED';
    await user.save();

    await Subscription.updateMany(
      { userId: user._id, status: 'active' },
      { $set: { status: 'revoked', notes: reason } }
    );

    await AdminAuditLog.create({
      action: 'PREMIUM_REVOKED',
      adminId: req.user._id,
      adminEmail: req.user.email,
      adminName: req.user.name,
      targetUserId: user._id,
      targetUserEmail: user.email,
      targetUserName: user.name,
      previousValue: previousState,
      newValue: { isPremium: false, premiumStatus: 'EXPIRED' },
      reason,
      ip: req.ip || '',
    });

    await AdminNotification.create({
      type: 'PREMIUM_REVOKED',
      title: 'Premium Revoked',
      message: `${req.user.name} revoked Premium for ${user.name} (${user.email}). Reason: ${reason}`,
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
    }).catch(() => {});

    return ApiResponse.success(res, { user }, 'Premium access revoked.');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/premium/payments
 * Complete payment transaction history with filters and search.
 */
export const getAdminPaymentHistory = async (req, res, next) => {
  try {
    const { q, status, plan, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (q) {
      filter.$or = [
        { userName: { $regex: q, $options: 'i' } },
        { userEmail: { $regex: q, $options: 'i' } },
        { razorpayOrderId: { $regex: q, $options: 'i' } },
        { razorpayPaymentId: { $regex: q, $options: 'i' } },
      ];
    }

    if (status && status !== 'all') filter.status = status;
    if (plan && plan !== 'all') filter.plan = plan;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Payment.countDocuments(filter),
    ]);

    return ApiResponse.paginated(res, payments, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/premium/audit-logs
 * List all admin audit actions.
 */
export const getAdminAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AdminAuditLog.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AdminAuditLog.countDocuments(),
    ]);

    return ApiResponse.paginated(res, logs, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/premium/notifications
 * Get payment & subscription notifications with unread count.
 */
export const getAdminNotifications = async (req, res, next) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      AdminNotification.find().sort({ createdAt: -1 }).limit(50).lean(),
      AdminNotification.countDocuments({ isRead: false }),
    ]);

    return ApiResponse.success(res, { notifications, unreadCount });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/premium/notifications/mark-read
 * Mark notification(s) as read.
 */
export const markNotificationRead = async (req, res, next) => {
  try {
    const { notificationId, markAll = false } = req.body;
    if (markAll) {
      await AdminNotification.updateMany({ isRead: false }, { $set: { isRead: true } });
    } else if (notificationId) {
      await AdminNotification.findByIdAndUpdate(notificationId, { $set: { isRead: true } });
    }
    return ApiResponse.success(res, null, 'Notifications updated.');
  } catch (error) {
    next(error);
  }
};
