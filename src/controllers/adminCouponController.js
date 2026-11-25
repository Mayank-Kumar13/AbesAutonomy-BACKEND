import Coupon, { COUPON_APPLICABLE_PLANS, COUPON_DISCOUNT_TYPES } from '../models/Coupon.js';
import CouponRedemption from '../models/CouponRedemption.js';
import AdminAuditLog from '../models/AdminAuditLog.js';
import ApiResponse from '../utils/ApiResponse.js';
import { generateCouponCode, normalizeCouponCode } from '../services/couponService.js';

function parseOptionalNumber(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function validateAndSanitizeCouponInput(body, isUpdate = false) {
  const payload = {};

  if (!isUpdate || body.code !== undefined || body.autoGenerate) {
    let code = body.autoGenerate
      ? generateCouponCode(body.prefix || 'ABES')
      : normalizeCouponCode(body.code);

    if (!code && !isUpdate) {
      code = generateCouponCode(body.prefix || 'ABES');
    }

    if (code) {
      if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
        throw new Error('Coupon code must be 3-32 characters (letters, numbers, - or _ only).');
      }
      payload.code = code;
    }
  }

  if (body.description !== undefined) {
    payload.description = String(body.description || '').trim().slice(0, 200);
  }

  const discountType = body.discountType || (!isUpdate ? 'percentage' : undefined);
  if (discountType !== undefined) {
    if (!COUPON_DISCOUNT_TYPES.includes(discountType)) {
      throw new Error('Invalid discount type. Choose percentage or fixed.');
    }
    payload.discountType = discountType;
  }

  if (body.discountValue !== undefined) {
    const val = Number(body.discountValue);
    if (!Number.isFinite(val) || val < 1) {
      throw new Error('Discount value must be at least 1.');
    }
    const effectiveType = payload.discountType || body.currentDiscountType || 'percentage';
    if (effectiveType === 'percentage' && val > 100) {
      throw new Error('Percentage discount cannot exceed 100%.');
    }
    payload.discountValue = Math.round(val * 100) / 100;
  }

  if (body.maxDiscountRupees !== undefined) {
    const maxCap = parseOptionalNumber(body.maxDiscountRupees);
    if (maxCap !== null && maxCap < 1) {
      throw new Error('Max discount cap must be at least ₹1 or left blank.');
    }
    payload.maxDiscountRupees = maxCap;
  }

  if (body.minOrderRupees !== undefined) {
    const minOrder = parseOptionalNumber(body.minOrderRupees);
    payload.minOrderRupees = minOrder !== null && minOrder >= 0 ? minOrder : 0;
  }

  if (body.applicablePlans !== undefined) {
    const plans = Array.isArray(body.applicablePlans) ? body.applicablePlans : [];
    const filtered = plans.filter((p) => COUPON_APPLICABLE_PLANS.includes(p));
    payload.applicablePlans = [...new Set(filtered)];
  }

  if (body.maxUses !== undefined) {
    const maxUses = parseOptionalNumber(body.maxUses);
    if (maxUses !== null && maxUses < 1) {
      throw new Error('Total usage limit must be at least 1 or left blank for unlimited.');
    }
    payload.maxUses = maxUses !== null ? Math.floor(maxUses) : null;
  }

  if (body.perUserLimit !== undefined) {
    const perUser = parseOptionalNumber(body.perUserLimit);
    payload.perUserLimit = perUser !== null && perUser >= 0 ? Math.floor(perUser) : 1;
  }

  if (body.startsAt !== undefined) {
    payload.startsAt = parseOptionalDate(body.startsAt);
  }
  if (body.expiresAt !== undefined) {
    payload.expiresAt = parseOptionalDate(body.expiresAt);
  }
  if (payload.startsAt && payload.expiresAt && payload.expiresAt <= payload.startsAt) {
    throw new Error('Expiry date must be later than the start date.');
  }

  if (body.isActive !== undefined) {
    payload.isActive = Boolean(body.isActive);
  }

  return payload;
}

/**
 * GET /api/admin/premium/coupons
 * List coupons with search, status filtering, and aggregate metrics.
 */
export const listCoupons = async (req, res, next) => {
  try {
    const { q = '', status = 'all' } = req.query;
    const filter = {};
    const now = new Date();

    if (q && q.trim()) {
      const regex = { $regex: q.trim(), $options: 'i' };
      filter.$or = [{ code: regex }, { description: regex }];
    }

    if (status === 'active') {
      filter.isActive = true;
      filter.$and = [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        {
          $or: [
            { maxUses: null },
            { maxUses: { $lte: 0 } },
            { $expr: { $lt: ['$usedCount', '$maxUses'] } },
          ],
        },
      ];
    } else if (status === 'inactive') {
      filter.isActive = false;
    } else if (status === 'expired') {
      filter.expiresAt = { $ne: null, $lte: now };
    } else if (status === 'exhausted') {
      filter.maxUses = { $ne: null, $gt: 0 };
      filter.$expr = { $gte: ['$usedCount', '$maxUses'] };
    }

    const [coupons, allCouponsStats] = await Promise.all([
      Coupon.find(filter).sort({ createdAt: -1 }).lean(),
      Coupon.aggregate([
        {
          $group: {
            _id: null,
            totalCoupons: { $sum: 1 },
            totalRedemptions: { $sum: '$usedCount' },
            totalDiscountPaise: { $sum: '$totalDiscountGivenPaise' },
          },
        },
      ]),
    ]);

    const activeCouponsCount = await Coupon.countDocuments({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    });

    const summary = allCouponsStats[0] || {
      totalCoupons: 0,
      totalRedemptions: 0,
      totalDiscountPaise: 0,
    };

    const enriched = coupons.map((c) => {
      const isExpired = Boolean(c.expiresAt && now > new Date(c.expiresAt));
      const isExhausted = Boolean(c.maxUses && c.usedCount >= c.maxUses);
      const effectiveStatus = !c.isActive
        ? 'inactive'
        : isExpired
        ? 'expired'
        : isExhausted
        ? 'exhausted'
        : 'active';

      return {
        ...c,
        effectiveStatus,
        totalDiscountGivenRupees: Number(((c.totalDiscountGivenPaise || 0) / 100).toFixed(2)),
      };
    });

    return ApiResponse.success(res, {
      coupons: enriched,
      summary: {
        totalCoupons: summary.totalCoupons,
        activeCoupons: activeCouponsCount,
        totalRedemptions: summary.totalRedemptions,
        totalDiscountRupees: Number(((summary.totalDiscountPaise || 0) / 100).toFixed(2)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/premium/coupons
 * Create or auto-generate a new coupon code.
 */
export const createCoupon = async (req, res, next) => {
  try {
    let payload;
    try {
      payload = validateAndSanitizeCouponInput(req.body, false);
    } catch (validationErr) {
      return ApiResponse.badRequest(res, validationErr.message);
    }

    if (!payload.code) {
      payload.code = generateCouponCode(req.body.prefix || 'ABES');
    }

    const existing = await Coupon.findOne({ code: payload.code });
    if (existing) {
      return ApiResponse.badRequest(res, `Coupon code "${payload.code}" already exists.`);
    }

    const coupon = await Coupon.create({
      ...payload,
      createdBy: req.user._id,
    });

    await AdminAuditLog.create({
      action: 'COUPON_CREATED',
      adminId: req.user._id,
      adminEmail: req.user.email,
      adminName: req.user.name,
      newValue: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        applicablePlans: coupon.applicablePlans,
        maxUses: coupon.maxUses,
        expiresAt: coupon.expiresAt,
      },
      reason: coupon.description || `Created coupon ${coupon.code}`,
      ip: req.ip || '',
    }).catch(() => {});

    return ApiResponse.created(res, coupon, `Coupon "${coupon.code}" created successfully.`);
  } catch (error) {
    if (error?.code === 11000) {
      return ApiResponse.badRequest(res, 'This coupon code already exists.');
    }
    next(error);
  }
};

/**
 * PATCH /api/admin/premium/coupons/:id
 * Update coupon details or toggle active status.
 */
export const updateCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return ApiResponse.notFound(res, 'Coupon not found.');
    }

    let payload;
    try {
      payload = validateAndSanitizeCouponInput(
        { ...req.body, currentDiscountType: coupon.discountType },
        true
      );
    } catch (validationErr) {
      return ApiResponse.badRequest(res, validationErr.message);
    }

    if (payload.code && payload.code !== coupon.code) {
      const conflict = await Coupon.findOne({ code: payload.code, _id: { $ne: coupon._id } });
      if (conflict) {
        return ApiResponse.badRequest(res, `Coupon code "${payload.code}" is already in use.`);
      }
    }

    const previousState = {
      code: coupon.code,
      isActive: coupon.isActive,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxUses: coupon.maxUses,
      expiresAt: coupon.expiresAt,
    };

    Object.assign(coupon, payload);
    await coupon.save();

    await AdminAuditLog.create({
      action: 'COUPON_UPDATED',
      adminId: req.user._id,
      adminEmail: req.user.email,
      adminName: req.user.name,
      previousValue: previousState,
      newValue: payload,
      reason: `Updated coupon ${coupon.code}`,
      ip: req.ip || '',
    }).catch(() => {});

    return ApiResponse.success(res, coupon, `Coupon "${coupon.code}" updated.`);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/premium/coupons/:id
 * Delete a coupon code permanently.
 */
export const deleteCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) {
      return ApiResponse.notFound(res, 'Coupon not found.');
    }

    await AdminAuditLog.create({
      action: 'COUPON_DELETED',
      adminId: req.user._id,
      adminEmail: req.user.email,
      adminName: req.user.name,
      previousValue: {
        code: coupon.code,
        usedCount: coupon.usedCount,
      },
      reason: `Deleted coupon ${coupon.code}`,
      ip: req.ip || '',
    }).catch(() => {});

    return ApiResponse.success(res, null, `Coupon "${coupon.code}" deleted.`);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/premium/coupons/:id/redemptions
 * View students who redeemed a specific coupon.
 */
export const getCouponRedemptions = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id).lean();
    if (!coupon) {
      return ApiResponse.notFound(res, 'Coupon not found.');
    }

    const redemptions = await CouponRedemption.find({ couponId: coupon._id })
      .sort({ redeemedAt: -1 })
      .limit(100)
      .lean();

    return ApiResponse.success(res, {
      coupon,
      redemptions: redemptions.map((r) => ({
        ...r,
        originalRupees: Number((r.originalAmountPaise / 100).toFixed(2)),
        discountRupees: Number((r.discountAmountPaise / 100).toFixed(2)),
        finalRupees: Number((r.finalAmountPaise / 100).toFixed(2)),
      })),
    });
  } catch (error) {
    next(error);
  }
};
