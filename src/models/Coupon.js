import mongoose from 'mongoose';

export const COUPON_DISCOUNT_TYPES = ['percentage', 'fixed'];
export const COUPON_APPLICABLE_PLANS = [
  'premium_1_month',
  'premium_4_months',
  'premium_lifetime',
  'premium_2_months',
];

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 32,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },
    discountType: {
      type: String,
      enum: COUPON_DISCOUNT_TYPES,
      required: true,
      default: 'percentage',
    },
    discountValue: {
      type: Number,
      required: true,
      min: 1,
    },
    maxDiscountRupees: {
      type: Number,
      default: null,
      min: 1,
    },
    minOrderRupees: {
      type: Number,
      default: 0,
      min: 0,
    },
    applicablePlans: {
      type: [String],
      enum: COUPON_APPLICABLE_PLANS,
      default: [], // Empty array means valid on all plans
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    startsAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    maxUses: {
      type: Number,
      default: null, // null = unlimited global uses
      min: 1,
    },
    perUserLimit: {
      type: Number,
      default: 1, // 0 or null = unlimited uses per user
      min: 0,
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalDiscountGivenPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

couponSchema.index({ isActive: 1, expiresAt: 1 });
couponSchema.index({ createdAt: -1 });

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
