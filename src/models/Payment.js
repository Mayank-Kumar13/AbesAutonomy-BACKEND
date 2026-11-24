import mongoose from 'mongoose';

const PAYMENT_STATUSES = ['created', 'captured', 'failed', 'refunded'];
const PLANS = ['premium_1_month', 'premium_2_months', 'premium_4_months', 'premium_lifetime'];

const paymentSchema = new mongoose.Schema(
  {
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
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      index: true,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      required: true, // in paise: 4900 = ₹49, 13900 = ₹139, 49900 = ₹499
    },
    currency: {
      type: String,
      default: 'INR',
    },
    plan: {
      type: String,
      enum: PLANS,
      required: true,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'created',
      index: true,
    },
    paymentMethod: {
      type: String,
      default: 'unknown',
    },
    receipt: {
      type: String,
      default: '',
    },
    errorDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    refundDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
