import mongoose from 'mongoose';

const SUBSCRIPTION_STATUSES = ['active', 'expired', 'revoked', 'extended'];
const PLANS = ['premium_1_month', 'premium_2_months', 'premium_4_months', 'premium_lifetime'];
const ACTIVATED_BY = ['payment', 'webhook', 'admin_manual'];

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
      index: true,
    },
    plan: {
      type: String,
      enum: PLANS,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: 'active',
      index: true,
    },
    activatedBy: {
      type: String,
      enum: ACTIVATED_BY,
      default: 'payment',
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ createdAt: -1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);
export default Subscription;
