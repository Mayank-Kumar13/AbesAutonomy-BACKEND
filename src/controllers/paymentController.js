import {
  SUBSCRIPTION_PLANS,
  createOrder,
  verifyPayment,
  processWebhook,
} from '../services/paymentService.js';
import { validateUserSubscription } from '../middleware/accessControl.js';
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
 * POST /api/payments/create-order
 * Create a new Razorpay order for authenticated user.
 */
export const createOrderHandler = async (req, res, next) => {
  try {
    const { planId } = req.body;
    if (!planId) {
      return ApiResponse.badRequest(res, 'Plan ID is required.');
    }

    const orderData = await createOrder(req.user, planId);
    return ApiResponse.success(res, orderData, 'Order created successfully');
  } catch (error) {
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
export const webhookHandler = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const eventId = req.headers['x-razorpay-event-id'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing webhook signature' });
    }

    // Use rawBody buffer if available (captured in app.js) or stringified body
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

    const now = new Date();
    let daysRemaining = 0;
    if (user.isPremium && user.premiumExpiryDate) {
      daysRemaining = Math.max(0, Math.ceil((new Date(user.premiumExpiryDate) - now) / (1000 * 60 * 60 * 24)));
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
      isSuperAdmin: isMainSuperAdmin(user),
      payments,
      subscriptions,
    });
  } catch (error) {
    next(error);
  }
};
