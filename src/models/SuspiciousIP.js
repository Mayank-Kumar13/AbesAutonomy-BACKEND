import mongoose from 'mongoose';

const suspiciousIPSchema = new mongoose.Schema(
  {
    ip: {
      type: String,
      required: true,
      index: true,
    },
    endpoint: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
    },
    attemptCount: {
      type: Number,
      default: 1,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const SuspiciousIP = mongoose.model('SuspiciousIP', suspiciousIPSchema);

export default SuspiciousIP;
