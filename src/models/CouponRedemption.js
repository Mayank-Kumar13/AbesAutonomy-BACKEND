import mongoose from 'mongoose';

const couponRedemptionSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
      index: true,
    },
    couponCode: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userName: {
      type: String,
      default: '',
    },
    userEmail: {
      type: String,
      default: '',
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      unique: true, // Prevents double counting on concurrent verify + webhook
    },
    plan: {
      type: String,
      required: true,
    },
    originalAmountPaise: {
      type: Number,
      required: true,
    },
    discountAmountPaise: {
      type: Number,
      required: true,
    },
    finalAmountPaise: {
      type: Number,
      required: true,
    },
    redeemedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

couponRedemptionSchema.index({ couponId: 1, userId: 1 });
couponRedemptionSchema.index({ redeemedAt: -1 });

const CouponRedemption = mongoose.model('CouponRedemption', couponRedemptionSchema);
export default CouponRedemption;
