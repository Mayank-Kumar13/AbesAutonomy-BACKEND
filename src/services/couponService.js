import crypto from 'crypto';
import Coupon from '../models/Coupon.js';
import CouponRedemption from '../models/CouponRedemption.js';

export class CouponError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'CouponError';
    this.statusCode = statusCode;
  }
}

export function normalizeCouponCode(rawCode) {
  return String(rawCode || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function generateCouponCode(prefix = 'ABES') {
  const cleanPrefix = String(prefix || 'ABES')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8) || 'ABES';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `${cleanPrefix}-${suffix}`;
}

/**
 * Pure deterministic validation and price calculation for a coupon + plan.
 * Returns paise-exact amounts and Snap-to-Free when final payable is below Razorpay ₹1 minimum.
 */
export function calculateCouponPricing(coupon, plan, now = new Date()) {
  if (!coupon) {
    throw new CouponError('Invalid coupon code.');
  }
  if (!plan || typeof plan.amount !== 'number') {
    throw new CouponError('Invalid subscription plan selected.');
  }
  if (!coupon.isActive) {
    throw new CouponError('This coupon code is currently inactive.');
  }
  if (coupon.startsAt && now < new Date(coupon.startsAt)) {
    throw new CouponError('This coupon code is not active yet.');
  }
  if (coupon.expiresAt && now > new Date(coupon.expiresAt)) {
    throw new CouponError('This coupon code has expired.');
  }
  if (
    coupon.maxUses !== null &&
    coupon.maxUses !== undefined &&
    coupon.maxUses > 0 &&
    coupon.usedCount >= coupon.maxUses
  ) {
    throw new CouponError('This coupon has reached its maximum usage limit.');
  }
  if (
    Array.isArray(coupon.applicablePlans) &&
    coupon.applicablePlans.length > 0 &&
    !coupon.applicablePlans.includes(plan.id)
  ) {
    throw new CouponError(`This coupon is not valid for the ${plan.name}.`);
  }
  if (coupon.minOrderRupees > 0 && plan.priceInRupees < coupon.minOrderRupees) {
    throw new CouponError(
      `Minimum order amount of ₹${coupon.minOrderRupees} is required for this coupon.`
    );
  }

  const originalAmountPaise = plan.amount;
  let discountAmountPaise = 0;

  if (coupon.discountType === 'percentage') {
    const pct = Math.max(1, Math.min(100, Number(coupon.discountValue) || 0));
    discountAmountPaise = Math.round((originalAmountPaise * pct) / 100);
    if (coupon.maxDiscountRupees && coupon.maxDiscountRupees > 0) {
      discountAmountPaise = Math.min(
        discountAmountPaise,
        Math.round(coupon.maxDiscountRupees * 100)
      );
    }
  } else {
    discountAmountPaise = Math.round((Number(coupon.discountValue) || 0) * 100);
  }

  discountAmountPaise = Math.max(0, Math.min(originalAmountPaise, discountAmountPaise));
  let finalAmountPaise = originalAmountPaise - discountAmountPaise;

  // Razorpay INR minimum payable is ₹1 (100 paise); snap sub-₹1 remainders to free activation.
  if (finalAmountPaise > 0 && finalAmountPaise < 100) {
    finalAmountPaise = 0;
    discountAmountPaise = originalAmountPaise;
  }

  const toRupees = (paise) => Number((paise / 100).toFixed(2));

  return {
    originalAmount: originalAmountPaise,
    discountAmount: discountAmountPaise,
    finalAmount: finalAmountPaise,
    originalRupees: toRupees(originalAmountPaise),
    discountRupees: toRupees(discountAmountPaise),
    finalRupees: toRupees(finalAmountPaise),
    isFree: finalAmountPaise === 0,
  };
}

/**
 * Validates global + per-user eligibility against MongoDB and computes plan pricing.
 */
export async function validateCouponForUser({ code, plan, userId = null }) {
  const normalizedCode = normalizeCouponCode(code);
  if (!normalizedCode) {
    throw new CouponError('Please enter a coupon code.');
  }

  const coupon = await Coupon.findOne({ code: normalizedCode });
  if (!coupon) {
    throw new CouponError('Invalid coupon code.');
  }

  if (userId && coupon.perUserLimit && coupon.perUserLimit > 0) {
    const userUses = await CouponRedemption.countDocuments({
      couponId: coupon._id,
      userId,
    });
    if (userUses >= coupon.perUserLimit) {
      throw new CouponError(
        coupon.perUserLimit === 1
          ? 'You have already used this coupon code.'
          : `You have reached the per-user limit (${coupon.perUserLimit}) for this coupon.`
      );
    }
  }

  const pricing = calculateCouponPricing(coupon, plan);
  return { coupon, pricing };
}

/**
 * Evaluates a coupon across all active subscription plans for live UI preview.
 */
export async function evaluateCouponAcrossPlans({ code, plans, userId = null }) {
  const normalizedCode = normalizeCouponCode(code);
  if (!normalizedCode) {
    throw new CouponError('Please enter a coupon code.');
  }

  const coupon = await Coupon.findOne({ code: normalizedCode }).lean();
  if (!coupon) {
    throw new CouponError('Invalid coupon code.');
  }

  const now = new Date();
  if (!coupon.isActive) {
    throw new CouponError('This coupon code is currently inactive.');
  }
  if (coupon.startsAt && now < new Date(coupon.startsAt)) {
    throw new CouponError('This coupon code is not active yet.');
  }
  if (coupon.expiresAt && now > new Date(coupon.expiresAt)) {
    throw new CouponError('This coupon code has expired.');
  }
  if (coupon.maxUses !== null && coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    throw new CouponError('This coupon has reached its maximum usage limit.');
  }

  if (userId && coupon.perUserLimit && coupon.perUserLimit > 0) {
    const userUses = await CouponRedemption.countDocuments({
      couponId: coupon._id,
      userId,
    });
    if (userUses >= coupon.perUserLimit) {
      throw new CouponError(
        coupon.perUserLimit === 1
          ? 'You have already used this coupon code.'
          : `You have reached the per-user limit (${coupon.perUserLimit}) for this coupon.`
      );
    }
  }

  const planBreakdown = {};
  let anyEligible = false;
  let firstIneligibleReason = '';

  for (const plan of plans) {
    if (plan.isLegacy) continue;
    try {
      const pricing = calculateCouponPricing(coupon, plan, now);
      planBreakdown[plan.id] = { eligible: true, ...pricing };
      anyEligible = true;
    } catch (err) {
      if (!firstIneligibleReason) firstIneligibleReason = err.message;
      planBreakdown[plan.id] = {
        eligible: false,
        reason: err.message,
        originalAmount: plan.amount,
        discountAmount: 0,
        finalAmount: plan.amount,
        originalRupees: plan.priceInRupees,
        discountRupees: 0,
        finalRupees: plan.priceInRupees,
        isFree: false,
      };
    }
  }

  if (!anyEligible) {
    throw new CouponError(firstIneligibleReason || 'This coupon is not eligible for any plan.');
  }

  return {
    coupon: {
      id: coupon._id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxDiscountRupees: coupon.maxDiscountRupees,
      minOrderRupees: coupon.minOrderRupees,
      applicablePlans: coupon.applicablePlans || [],
    },
    plans: planBreakdown,
  };
}

/**
 * Atomically reserves a global usage slot on Coupon (used for 100% free orders).
 */
export async function reserveFreeCouponUsage(coupon, userId) {
  if (coupon.perUserLimit && coupon.perUserLimit > 0) {
    const existingUses = await CouponRedemption.countDocuments({
      couponId: coupon._id,
      userId,
    });
    if (existingUses >= coupon.perUserLimit) {
      throw new CouponError(
        coupon.perUserLimit === 1
          ? 'You have already used this coupon code.'
          : `You have reached the per-user limit (${coupon.perUserLimit}) for this coupon.`
      );
    }
  }

  const now = new Date();
  const updated = await Coupon.findOneAndUpdate(
    {
      _id: coupon._id,
      isActive: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        {
          $or: [
            { maxUses: null },
            { maxUses: { $lte: 0 } },
            { $expr: { $lt: ['$usedCount', '$maxUses'] } },
          ],
        },
      ],
    },
    { $inc: { usedCount: 1 } },
    { new: true }
  );

  if (!updated) {
    throw new CouponError('This coupon is no longer available or usage limit reached.');
  }
  return updated;
}

export async function releaseFreeCouponUsage(couponId) {
  if (!couponId) return;
  await Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: -1 } }).catch(() => {});
}

/**
 * Idempotently logs coupon redemption after payment capture / free activation.
 * incrementUsedCount=false when free-coupon slot was already atomically incremented upfront.
 */
export async function recordCouponRedemption({
  couponId,
  couponCode,
  userId,
  userName = '',
  userEmail = '',
  paymentId,
  plan,
  originalAmountPaise,
  discountAmountPaise,
  finalAmountPaise,
  incrementUsedCount = true,
}) {
  if (!couponId || !paymentId) return null;

  const existing = await CouponRedemption.findOne({ paymentId });
  if (existing) return existing;

  try {
    const redemption = await CouponRedemption.create({
      couponId,
      couponCode,
      userId,
      userName,
      userEmail,
      paymentId,
      plan,
      originalAmountPaise: originalAmountPaise ?? finalAmountPaise + (discountAmountPaise || 0),
      discountAmountPaise: discountAmountPaise || 0,
      finalAmountPaise,
      redeemedAt: new Date(),
    });

    const incFields = {
      totalDiscountGivenPaise: discountAmountPaise || 0,
    };
    if (incrementUsedCount) {
      incFields.usedCount = 1;
    }

    await Coupon.findByIdAndUpdate(couponId, { $inc: incFields }).catch((err) => {
      console.error('Failed updating coupon metrics:', err.message);
    });

    return redemption;
  } catch (err) {
    // E11000 duplicate paymentId means concurrent webhook/verify already logged it
    if (err?.code === 11000) {
      return CouponRedemption.findOne({ paymentId });
    }
    console.error('Failed recording coupon redemption:', err.message);
    return null;
  }
}
