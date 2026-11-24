import crypto from 'crypto';
import Razorpay from 'razorpay';
import env from '../config/env.js';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import PaymentWebhookEvent from '../models/PaymentWebhookEvent.js';
import AdminNotification from '../models/AdminNotification.js';
import AdminAuditLog from '../models/AdminAuditLog.js';

/**
 * Fixed subscription plans definition.
 * Amounts are strictly defined on the server in paise (INR).
 */
export const SUBSCRIPTION_PLANS = {
  premium_1_month: {
    id: 'premium_1_month',
    name: 'Monthly Plan',
    subTitle: '1-Month Exam Sprint',
    amount: 2900, // 2900 paise = ₹29
    priceInRupees: 29,
    durationDays: 30,
    features: [
      'Unlimited access to all subject notes & theory PDFs',
      'AI Academic Study Assistant & instant doubt solver',
      'Handwritten toppers\' notes & assignment solutions',
      'PYQs included 100% free forever',
      'Verified student Premium badge',
    ],
  },
  premium_4_months: {
    id: 'premium_4_months',
    name: 'Semester Plan',
    subTitle: 'Full Semester Coverage',
    amount: 9900, // 9900 paise = ₹99
    priceInRupees: 99,
    durationDays: 120,
    isBestValue: true,
    features: [
      'All Monthly Plan features included',
      'Full 120-Day semester exam protection',
      'Priority AI Study Assistant query processing',
      'Complete question bank & solved sample papers',
      'Early access to upcoming 2.0 academic tools',
    ],
  },
  premium_lifetime: {
    id: 'premium_lifetime',
    name: 'Lifetime Plan',
    subTitle: 'Entire 4-Year B.Tech Degree Access',
    amount: 39900, // 39900 paise = ₹399
    priceInRupees: 399,
    durationDays: 36500, // 100 years lifetime coverage
    isLifetime: true,
    features: [
      'Permanent lifetime access — Zero renewals',
      'All 8 Semesters across all engineering branches',
      'Unlimited high-speed downloads & offline saves',
      'Unrestricted AI Assistant with highest token limit',
      'Exclusive Lifetime Scholar verified badge & VIP support',
    ],
  },
  // Legacy / fallback plan support
  premium_2_months: {
    id: 'premium_2_months',
    name: 'Premium – 2 Months',
    amount: 10000, // 10000 paise = ₹100
    priceInRupees: 100,
    durationDays: 60,
    isLegacy: true,
  },
};

let razorpayInstance = null;

export const getRazorpayInstance = () => {
  if (razorpayInstance) return razorpayInstance;

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    console.warn('⚠️ Razorpay credentials not configured in environment.');
  }

  razorpayInstance = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });

  return razorpayInstance;
};

/**
 * Creates an authorized Razorpay order for a selected plan.
 */
export const createOrder = async (user, planId) => {
  const plan = SUBSCRIPTION_PLANS[planId];
  if (!plan) {
    throw new Error('Invalid subscription plan selected.');
  }

  const razorpay = getRazorpayInstance();
  const receipt = `rcpt_${Date.now()}_${user._id.toString().slice(-4)}`;

  const orderOptions = {
    amount: plan.amount,
    currency: 'INR',
    receipt,
    notes: {
      userId: user._id.toString(),
      userEmail: user.email,
      plan: planId,
    },
  };

  const razorpayOrder = await razorpay.orders.create(orderOptions);

  const paymentRecord = await Payment.create({
    userId: user._id,
    userName: user.name,
    userEmail: user.email,
    razorpayOrderId: razorpayOrder.id,
    amount: plan.amount,
    currency: 'INR',
    plan: planId,
    status: 'created',
    receipt,
  });

  return {
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    keyId: env.RAZORPAY_KEY_ID,
    plan,
    paymentId: paymentRecord._id,
  };
};

/**
 * Atomically activates or extends a user's subscription.
 */
export const activateOrExtendSubscription = async (
  userId,
  planId,
  paymentId = null,
  activatedBy = 'payment',
  adminId = null,
  customDays = null,
  adminReason = ''
) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found.');

  const plan = SUBSCRIPTION_PLANS[planId];
  const durationDays = customDays || (plan ? plan.durationDays : 60);

  const now = new Date();
  let baseDate = now;

  // If user already has an active, unexpired subscription, extend from the current expiry date
  if (user.isPremium && user.premiumExpiryDate && new Date(user.premiumExpiryDate) > now) {
    baseDate = new Date(user.premiumExpiryDate);
  }

  // If lifetime plan, set expiry date 100 years in the future
  const newExpiryDate = (plan?.isLifetime || planId === 'premium_lifetime')
    ? new Date(now.getTime() + 100 * 365.25 * 24 * 60 * 60 * 1000)
    : new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

  const previousState = {
    isPremium: user.isPremium,
    premiumPlan: user.premiumPlan,
    premiumExpiryDate: user.premiumExpiryDate,
    premiumStatus: user.premiumStatus,
  };

  user.isPremium = true;
  user.premiumPlan = planId || 'premium_4_months';
  if (!user.premiumStartDate) user.premiumStartDate = now;
  user.premiumExpiryDate = newExpiryDate;
  user.premiumStatus = 'ACTIVE';

  await user.save();

  const subscriptionRecord = await Subscription.create({
    userId: user._id,
    paymentId,
    plan: planId || 'premium_4_months',
    startDate: now,
    endDate: newExpiryDate,
    status: 'active',
    activatedBy,
    adminId,
    notes: adminReason,
  });

  return { user, subscription: subscriptionRecord, previousState };
};

/**
 * Verifies Razorpay payment signature and activates the subscription.
 * Idempotent: safe against repeated verify requests.
 */
export const verifyPayment = async (user, { razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new Error('Missing payment verification details.');
  }

  // 1. Verify HMAC SHA256 Signature
  const hmac = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET);
  hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
  const generatedSignature = hmac.digest('hex');

  if (generatedSignature !== razorpay_signature) {
    throw new Error('Payment signature verification failed.');
  }

  // 2. Fetch payment details directly from Razorpay API
  const razorpay = getRazorpayInstance();
  const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);

  if (paymentDetails.order_id !== razorpay_order_id) {
    throw new Error('Order ID mismatch in payment details.');
  }

  if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
    throw new Error(`Payment is not in captured status (current: ${paymentDetails.status}).`);
  }

  // 3. Find and update Payment record
  const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
  if (!payment) {
    throw new Error('Payment record not found for this order.');
  }

  const plan = SUBSCRIPTION_PLANS[payment.plan];
  if (!plan || paymentDetails.amount !== plan.amount) {
    throw new Error('Payment amount does not match plan price.');
  }

  // Idempotency: If already captured, avoid duplicate processing
  if (payment.status === 'captured') {
    const existingSub = await Subscription.findOne({ paymentId: payment._id });
    return {
      success: true,
      alreadyProcessed: true,
      user,
      subscription: existingSub,
      payment,
    };
  }

  // Update payment status
  payment.status = 'captured';
  payment.razorpayPaymentId = razorpay_payment_id;
  payment.razorpaySignature = razorpay_signature;
  payment.paymentMethod = paymentDetails.method || 'upi';
  payment.verifiedAt = new Date();
  await payment.save();

  // 4. Activate or extend subscription
  const { subscription } = await activateOrExtendSubscription(
    user._id,
    payment.plan,
    payment._id,
    'payment'
  );

  // 5. Create Admin Notification
  await AdminNotification.create({
    type: 'PAYMENT_SUCCESS',
    title: 'New Premium Subscription Purchased',
    message: `${user.name} (${user.email}) purchased ${plan.name} for ₹${plan.priceInRupees}.`,
    userId: user._id,
    userName: user.name,
    userEmail: user.email,
    paymentId: payment._id,
    orderId: payment.razorpayOrderId,
    amount: plan.priceInRupees,
  }).catch(() => {});

  return {
    success: true,
    user,
    subscription,
    payment,
    plan,
  };
};

/**
 * Handles incoming Razorpay Webhook events.
 */
export const processWebhook = async (rawBodyBuffer, signature, eventHeader) => {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error('Webhook secret is not configured.');
  }

  // 1. Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBodyBuffer)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new Error('Invalid webhook signature.');
  }

  const body = JSON.parse(rawBodyBuffer.toString());
  const eventId = eventHeader || body.event_id || `evt_${Date.now()}_${Math.random()}`;

  // 2. Check for duplicate webhook event (idempotency)
  const existingEvent = await PaymentWebhookEvent.findOne({ eventId });
  if (existingEvent && existingEvent.processed) {
    return { status: 'already_processed', eventId };
  }

  const webhookLog = existingEvent || (await PaymentWebhookEvent.create({
    eventId,
    event: body.event,
    payload: body,
  }));

  try {
    const eventName = body.event;
    const paymentEntity = body.payload?.payment?.entity;
    const orderEntity = body.payload?.order?.entity;

    if (eventName === 'payment.captured' || eventName === 'order.paid') {
      const orderId = paymentEntity?.order_id || orderEntity?.id;
      const paymentId = paymentEntity?.id;

      if (orderId) {
        const payment = await Payment.findOne({ razorpayOrderId: orderId });
        if (payment && payment.status !== 'captured') {
          payment.status = 'captured';
          payment.razorpayPaymentId = paymentId;
          payment.paymentMethod = paymentEntity?.method || 'upi';
          payment.verifiedAt = new Date();
          await payment.save();

          await activateOrExtendSubscription(payment.userId, payment.plan, payment._id, 'webhook');

          const user = await User.findById(payment.userId);
          const plan = SUBSCRIPTION_PLANS[payment.plan];
          await AdminNotification.create({
            type: 'PAYMENT_SUCCESS',
            title: 'Webhook: Payment Verified',
            message: `${user?.name || 'Student'} completed ${plan?.name || payment.plan} payment of ₹${payment.amount / 100}.`,
            userId: payment.userId,
            userName: user?.name || '',
            userEmail: user?.email || payment.userEmail,
            paymentId: payment._id,
            orderId,
            amount: payment.amount / 100,
          }).catch(() => {});
        }
      }
    } else if (eventName === 'payment.failed') {
      const orderId = paymentEntity?.order_id;
      if (orderId) {
        const payment = await Payment.findOne({ razorpayOrderId: orderId });
        if (payment && payment.status !== 'captured') {
          payment.status = 'failed';
          payment.errorDetails = paymentEntity?.error_description || 'Payment failed';
          await payment.save();

          await AdminNotification.create({
            type: 'PAYMENT_FAILED',
            title: 'Payment Failed',
            message: `Payment failed for order ${orderId}: ${paymentEntity?.error_description || 'Unknown error'}`,
            userId: payment.userId,
            userName: payment.userName,
            userEmail: payment.userEmail,
            paymentId: payment._id,
            orderId,
            amount: payment.amount / 100,
          }).catch(() => {});
        }
      }
    }

    webhookLog.processed = true;
    webhookLog.processedAt = new Date();
    await webhookLog.save();

    return { status: 'success', event: body.event };
  } catch (err) {
    webhookLog.error = err.message;
    await webhookLog.save();
    throw err;
  }
};
