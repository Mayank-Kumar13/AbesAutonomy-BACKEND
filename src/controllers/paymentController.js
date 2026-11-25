import {
  SUBSCRIPTION_PLANS,
  createOrder,
  verifyPayment,
  processWebhook,
} from '../services/paymentService.js';
import {
  evaluateCouponAcrossPlans,
  validateCouponForUser,
  CouponError,
} from '../services/couponService.js';
import { validateUserSubscription, validateAndRenewFreePdfQuota } from '../middleware/accessControl.js';
import { isMainSuperAdmin } from '../utils/superAdmin.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import ApiResponse from '../utils/ApiResponse.js';

/**
 * GET /api/payments/plans
 * Returns available subscription plans with pricing and features.
 */
export const getPlans = (req, res) => {
  return ApiResponse.success(res, Object.values(SUBSCRIPTION_PLANS));
};

/**
 * POST /api/payments/validate-coupon
 * Validates a coupon code and returns live discounted pricing across eligible plans.
 */
export const validateCouponHandler = async (req, res, next) => {
  try {
    const { code, planId } = req.body;
    if (!code || !String(code).trim()) {
      return ApiResponse.badRequest(res, 'Please enter a coupon code.');
    }

    const userId = req.user?._id || null;

    if (planId) {
      const plan = SUBSCRIPTION_PLANS[planId];
      if (!plan) {
        return ApiResponse.badRequest(res, 'Invalid subscription plan selected.');
      }
      const { coupon, pricing } = await validateCouponForUser({ code, plan, userId });
      const allPlans = await evaluateCouponAcrossPlans({
        code,
        plans: Object.values(SUBSCRIPTION_PLANS),
        userId,
      });
      return ApiResponse.success(
        res,
        {
          coupon: allPlans.coupon,
          pricing,
          plans: allPlans.plans,
          appliedCode: coupon.code,
        },
        `Coupon ${coupon.code} applied!`
      );
    }

    const evaluation = await evaluateCouponAcrossPlans({
      code,
      plans: Object.values(SUBSCRIPTION_PLANS),
      userId,
    });
    return ApiResponse.success(res, evaluation, `Coupon ${evaluation.coupon.code} applied!`);
  } catch (error) {
    if (error instanceof CouponError || error.statusCode === 400) {
      return ApiResponse.badRequest(res, error.message);
    }
    next(error);
  }
};

/**
 * POST /api/payments/create-order
 * Create a new Razorpay order (with optional coupon) or free 100%-discounted activation.
 */
export const createOrderHandler = async (req, res, next) => {
  try {
    const { planId, couponCode } = req.body;
    if (!planId) {
      return ApiResponse.badRequest(res, 'Plan ID is required.');
    }

    const orderData = await createOrder(req.user, planId, couponCode || null);
    return ApiResponse.success(
      res,
      orderData,
      orderData.isFreeActivation
        ? 'Subscription activated with 100% coupon discount!'
        : 'Order created successfully'
    );
  } catch (error) {
    if (error instanceof CouponError || error.statusCode === 400) {
      return ApiResponse.badRequest(res, error.message);
    }
    next(error);
  }
};

/**
 * POST /api/payments/verify
 * Verifies payment signature and activates the subscription.
 */
export const verifyPaymentHandler = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return ApiResponse.badRequest(res, 'Payment verification details missing.');
    }

    const result = await verifyPayment(req.user, {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    return ApiResponse.success(res, result, 'Subscription activated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payments/webhook
 * Receives and processes server-to-server Razorpay webhooks.
 */
export const webhookHandler = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const eventId = req.headers['x-razorpay-event-id'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing webhook signature' });
    }

    const rawBodyBuffer = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const result = await processWebhook(rawBodyBuffer, signature, eventId);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.status(400).json({ error: error.message });
  }
};

/**
 * GET /api/payments/subscription-status
 * Get the current user's complete subscription, payment history, and quota details.
 */
export const getUserSubscriptionStatus = async (req, res, next) => {
  try {
    const user = req.user;
    await validateUserSubscription(user);
    await validateAndRenewFreePdfQuota(user);

    const now = new Date();
    let daysRemaining = 0;
    if (user.isPremium && user.premiumExpiryDate) {
      if (user.premiumPlan === 'premium_lifetime') {
        daysRemaining = 99999;
      } else {
        daysRemaining = Math.max(
          0,
          Math.ceil((new Date(user.premiumExpiryDate) - now) / (1000 * 60 * 60 * 24))
        );
      }
    }

    const [payments, subscriptions] = await Promise.all([
      Payment.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10).lean(),
      Subscription.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    const freeCount = user.freePdfAccessCount || 0;
    const freeRemaining = Math.max(0, 3 - freeCount);

    return ApiResponse.success(res, {
      isPremium: user.isPremium || false,
      premiumPlan: user.premiumPlan || null,
      premiumStartDate: user.premiumStartDate || null,
      premiumExpiryDate: user.premiumExpiryDate || null,
      premiumStatus: user.premiumStatus || 'NONE',
      daysRemaining,
      freePdfAccessCount: freeCount,
      freePdfRemaining: freeRemaining,
      freePdfResetAt: user.freePdfResetAt || null,
      freePdfResetInSeconds: user.freePdfResetAt
        ? Math.max(0, Math.ceil((new Date(user.freePdfResetAt) - now) / 1000))
        : null,
      isSuperAdmin: isMainSuperAdmin(user),
      payments,
      subscriptions,
    });
  } catch (error) {
    next(error);
  }
};
