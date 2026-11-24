import mongoose from 'mongoose';
import { isMainSuperAdmin } from '../utils/superAdmin.js';
import ApiResponse from '../utils/ApiResponse.js';
import PDFAccessLog from '../models/PDFAccessLog.js';
import User from '../models/User.js';

export const FREE_PDF_LIMIT = 3;

/**
 * Checks and auto-renews 24-hour free PDF quota if 24h cycle has expired.
 * 
 * @param {object} user - Mongoose User document or plain user object
 * @returns {Promise<boolean>} - true if quota was renewed
 */
export const validateAndRenewFreePdfQuota = async (user) => {
  if (!user) return false;

  const currentCount = user.freePdfAccessCount || 0;
  const now = new Date();

  // If reset date has arrived, reset count to 0 and clear accessed array
  if (user.freePdfResetAt && new Date(user.freePdfResetAt) <= now) {
    user.freePdfAccessCount = 0;
    user.freePdfAccessedIds = [];
    user.freePdfResetAt = null;

    if (user._id && mongoose.connection?.readyState === 1 && typeof User?.findByIdAndUpdate === 'function') {
      try {
        await User.findByIdAndUpdate(user._id, {
          $set: {
            freePdfAccessCount: 0,
            freePdfAccessedIds: [],
            freePdfResetAt: null,
          },
        });
      } catch (err) {
        console.error('Failed to auto-renew free PDF quota in DB:', err.message);
      }
    }
    return true;
  }

  // If user has reached the limit (>= 3) but freePdfResetAt was never set, initialize it to 24h from now
  if (currentCount >= FREE_PDF_LIMIT && !user.freePdfResetAt) {
    const resetDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    user.freePdfResetAt = resetDate;

    if (user._id && mongoose.connection?.readyState === 1 && typeof User?.findByIdAndUpdate === 'function') {
      try {
        await User.findByIdAndUpdate(user._id, {
          $set: { freePdfResetAt: resetDate },
        });
      } catch (err) {
        console.error('Failed to initialize freePdfResetAt in DB:', err.message);
      }
    }
  }

  return false;
};

/**
 * Validates and updates user's subscription status on-the-fly.
 * Automatically marks expired subscriptions as EXPIRED.
 * 
 * @param {object} user - Mongoose User document
 * @returns {Promise<boolean>} - true if actively premium, false otherwise
 */
export const validateUserSubscription = async (user) => {
  if (!user) return false;

  if (user.isPremium) {
    // Lifetime subscription never expires
    if (user.premiumPlan === 'premium_lifetime') {
      return true;
    }
    if (user.premiumExpiryDate && new Date(user.premiumExpiryDate) <= new Date()) {
      user.isPremium = false;
      user.premiumStatus = 'EXPIRED';
      await user.save().catch(() => {});
      return false;
    }
    return true;
  }

  return false;
};

/**
 * Centralized evaluation of whether a user can access a specific note PDF.
 * Enforces the core platform access policy:
 * - PYQs: FREE FOREVER for everyone (unrestricted, zero counter impact).
 * - Main Super Admin: Unrestricted PDF access.
 * - Active Premium Users: Unrestricted access to all resources.
 * - Free / Expired Users: 3 free accesses for non-PYQ documents.
 * 
 * @param {object} user - Authenticated user document (or null)
 * @param {object} note - The Note document
 * @returns {Promise<{ allowed: boolean, reason: string, code?: string, message?: string, consumeSlot?: boolean, remaining?: number, count?: number }>}
 */
export const evaluateNoteAccess = async (user, note) => {
  if (!note) {
    return { allowed: false, reason: 'not_found', message: 'Document not found' };
  }

  // 1. PYQ resources are FREE FOREVER for everyone without any limits
  const resourceType = (note.resourceType || '').toLowerCase();
  if (resourceType === 'pyq') {
    return {
      allowed: true,
      reason: 'pyq_free',
      message: 'PYQ documents are freely accessible to all students.',
    };
  }

  // 2. Main Super Admin has unrestricted PDF access
  if (isMainSuperAdmin(user)) {
    return {
      allowed: true,
      reason: 'super_admin',
      message: 'Unrestricted Super Admin document access.',
    };
  }

  // 3. For all non-PYQ materials, user must be logged in
  if (!user) {
    return {
      allowed: false,
      reason: 'login_required',
      code: 'LOGIN_REQUIRED',
      message: 'Please sign in to read this academic resource.',
    };
  }

  // 4. Active Premium Subscription check
  const isSubActive = await validateUserSubscription(user);
  if (isSubActive) {
    return {
      allowed: true,
      reason: 'premium_subscription',
      message: 'Access granted via active Premium subscription.',
    };
  }

  // 5. Free PDF Access System (3 free documents with 24-hour auto-renewal)
  await validateAndRenewFreePdfQuota(user);

  const currentCount = user.freePdfAccessCount || 0;

  // Once all 3 free document accesses are exhausted, all non-PYQ documents are locked until 24h timer expires
  if (currentCount >= FREE_PDF_LIMIT) {
    const now = Date.now();
    const resetTime = user.freePdfResetAt ? new Date(user.freePdfResetAt).getTime() : (now + 24 * 60 * 60 * 1000);
    const diffMs = Math.max(0, resetTime - now);
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const resetInSeconds = Math.ceil(diffMs / 1000);

    return {
      allowed: false,
      reason: 'limit_reached',
      code: 'PREMIUM_REQUIRED',
      remaining: 0,
      count: currentCount,
      freePdfResetAt: user.freePdfResetAt || new Date(resetTime),
      resetInSeconds,
      resetInMs: diffMs,
      message: `You have used all ${FREE_PDF_LIMIT} free document accesses for today. Buy ABES Autonomy Premium for unlimited access, or wait ${hours}h ${minutes}m for your 24-hour free daily quota to renew.`,
    };
  }

  const noteIdStr = note._id.toString();
  const accessedIds = (user.freePdfAccessedIds || []).map((id) => id.toString());

  // Repeated access to an already unlocked note within the 3 allowance does NOT count again
  if (accessedIds.includes(noteIdStr)) {
    return {
      allowed: true,
      reason: 'free_allowance_repeat',
      consumeSlot: false,
      remaining: Math.max(0, FREE_PDF_LIMIT - currentCount),
      count: currentCount,
      message: 'Document already unlocked in your free allowance.',
    };
  }

  // Accessing a new document under free allowance
  return {
    allowed: true,
    reason: 'free_allowance_new',
    consumeSlot: true,
    remaining: FREE_PDF_LIMIT - (currentCount + 1),
    count: currentCount + 1,
    message: `Access granted (${currentCount + 1}/${FREE_PDF_LIMIT} free document accesses used).`,
  };
};

/**
 * Record an authorized or blocked PDF access event.
 * If consumeSlot is true, atomically updates the user's free access counter and array.
 */
export const recordPdfAccess = async (req, user, note, evaluationResult) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || req.ip || '';
    const userAgent = req.headers['user-agent'] || '';

    // If new free slot was consumed, update user securely in MongoDB
    if (user && evaluationResult.consumeSlot) {
      const newCount = (user.freePdfAccessCount || 0) + 1;
      const updateFields = {
        $inc: { freePdfAccessCount: 1 },
        $addToSet: { freePdfAccessedIds: note._id },
      };

      // If user reaches limit with this access, start the 24-hour reset countdown
      if (newCount >= FREE_PDF_LIMIT && !user.freePdfResetAt) {
        const resetDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        updateFields.$set = { freePdfResetAt: resetDate };
        user.freePdfResetAt = resetDate;
      }

      if (mongoose.connection?.readyState === 1) {
        await User.findByIdAndUpdate(user._id, updateFields);
      }
      // Synchronize in-memory user object
      user.freePdfAccessCount = newCount;
      if (!user.freePdfAccessedIds) user.freePdfAccessedIds = [];
      user.freePdfAccessedIds.push(note._id);
    }

    // Log the access
    if (mongoose.connection?.readyState === 1) {
      await PDFAccessLog.create({
      userId: user?._id || null,
      userEmail: user?.email || '',
      userName: user?.name || '',
      noteId: note._id,
      noteTitle: note.title,
      subject: note.subject,
      resourceType: note.resourceType,
      accessType: evaluationResult.reason.includes('pyq')
        ? 'pyq_free'
        : evaluationResult.reason === 'super_admin'
        ? 'super_admin'
        : evaluationResult.reason === 'premium_subscription'
        ? 'premium_subscription'
        : evaluationResult.allowed
        ? 'free_allowance'
        : 'blocked',
      allowed: evaluationResult.allowed,
      ip,
      userAgent,
    });
    }
  } catch (err) {
    console.error('Failed to record PDF access log:', err.message);
  }
};

/**
 * Express middleware requiring an active Premium subscription (or Super Admin exemption).
 * Reusable for AI assistant, premium tools, and future premium-only features.
 */
export const requirePremium = async (req, res, next) => {
  try {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required.');
    }

    // Super Admin exemption
    if (isMainSuperAdmin(req.user)) {
      return next();
    }

    // Check active subscription
    const isSubActive = await validateUserSubscription(req.user);
    if (isSubActive) {
      return next();
    }

    return ApiResponse.forbidden(res, 'Active Premium subscription required to access this feature.', {
      code: 'PREMIUM_REQUIRED',
      isPremium: false,
      premiumStatus: req.user.premiumStatus || 'NONE',
    });
  } catch (error) {
    next(error);
  }
};
