import test from 'node:test';
import assert from 'node:assert';
import {
  calculateCouponPricing,
  generateCouponCode,
  normalizeCouponCode,
  CouponError,
} from '../services/couponService.js';
import { SUBSCRIPTION_PLANS } from '../services/paymentService.js';

test('Coupon Pricing & Validation Engine', async (suite) => {
  const semesterPlan = SUBSCRIPTION_PLANS.premium_4_months; // ₹99 (9900 paise)
  const monthlyPlan = SUBSCRIPTION_PLANS.premium_1_month; // ₹29 (2900 paise)
  const lifetimePlan = SUBSCRIPTION_PLANS.premium_lifetime; // ₹399 (39900 paise)

  await suite.test('normalizes and generates clean uppercase coupon codes', () => {
    assert.strictEqual(normalizeCouponCode('  abes 20 '), 'ABES20');
    const code = generateCouponCode('fest');
    assert.match(code, /^FEST-[A-Z0-9]{6}$/);
  });

  await suite.test('calculates percentage discount accurately and respects max cap', () => {
    const coupon = {
      code: 'SAVE50',
      isActive: true,
      discountType: 'percentage',
      discountValue: 50,
      maxDiscountRupees: 40,
      minOrderRupees: 0,
      applicablePlans: [],
      usedCount: 0,
      maxUses: 100,
    };

    // 50% of 99 = 49.50, capped at 40 => final 59 (5900 paise)
    const semResult = calculateCouponPricing(coupon, semesterPlan);
    assert.strictEqual(semResult.discountAmount, 4000);
    assert.strictEqual(semResult.finalAmount, 5900);
    assert.strictEqual(semResult.finalRupees, 59);
    assert.strictEqual(semResult.isFree, false);

    // 50% of 29 = 14.50 (below cap 40) => final 14.50 (1450 paise)
    const monResult = calculateCouponPricing(coupon, monthlyPlan);
    assert.strictEqual(monResult.discountAmount, 1450);
    assert.strictEqual(monResult.finalAmount, 1450);
    assert.strictEqual(monResult.finalRupees, 14.5);
  });

  await suite.test('calculates fixed rupee discount and snaps sub-₹1 amounts to free ₹0', () => {
    const flatCoupon = {
      code: 'FLAT20',
      isActive: true,
      discountType: 'fixed',
      discountValue: 20,
      minOrderRupees: 0,
      applicablePlans: [],
      usedCount: 0,
    };
    const res = calculateCouponPricing(flatCoupon, semesterPlan);
    assert.strictEqual(res.discountAmount, 2000);
    assert.strictEqual(res.finalAmount, 7900);
    assert.strictEqual(res.isFree, false);

    // 99% off ₹29 = ₹0.29 left (< Razorpay ₹1 minimum) -> snaps cleanly to ₹0 free
    const nearlyFree = {
      code: 'VIP99',
      isActive: true,
      discountType: 'percentage',
      discountValue: 99,
      minOrderRupees: 0,
      applicablePlans: [],
      usedCount: 0,
    };
    const freeSnap = calculateCouponPricing(nearlyFree, monthlyPlan);
    assert.strictEqual(freeSnap.finalAmount, 0);
    assert.strictEqual(freeSnap.discountAmount, 2900);
    assert.strictEqual(freeSnap.isFree, true);
  });

  await suite.test('rejects inactive, expired, exhausted, plan-restricted, and below-min coupons', () => {
    assert.throws(
      () =>
        calculateCouponPricing(
          { isActive: false, discountType: 'fixed', discountValue: 10 },
          monthlyPlan
        ),
      CouponError
    );

    assert.throws(
      () =>
        calculateCouponPricing(
          {
            isActive: true,
            discountType: 'fixed',
            discountValue: 10,
            expiresAt: new Date(Date.now() - 60000),
          },
          monthlyPlan
        ),
      /expired/
    );

    assert.throws(
      () =>
        calculateCouponPricing(
          {
            isActive: true,
            discountType: 'fixed',
            discountValue: 10,
            maxUses: 5,
            usedCount: 5,
          },
          monthlyPlan
        ),
      /maximum usage/
    );

    assert.throws(
      () =>
        calculateCouponPricing(
          {
            isActive: true,
            discountType: 'fixed',
            discountValue: 50,
            applicablePlans: ['premium_lifetime'],
          },
          semesterPlan
        ),
      /not valid for/
    );

    assert.throws(
      () =>
        calculateCouponPricing(
          {
            isActive: true,
            discountType: 'fixed',
            discountValue: 20,
            minOrderRupees: 99,
          },
          monthlyPlan
        ),
      /Minimum order/
    );

    // Lifetime satisfies minOrder 99 and applicablePlans
    const validLifetime = calculateCouponPricing(
      {
        isActive: true,
        discountType: 'fixed',
        discountValue: 100,
        minOrderRupees: 99,
        applicablePlans: ['premium_lifetime'],
      },
      lifetimePlan
    );
    assert.strictEqual(validLifetime.finalRupees, 299);
  });
});
