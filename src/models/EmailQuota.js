import mongoose from 'mongoose';

const emailQuotaSchema = new mongoose.Schema({
  dailyLimit: {
    type: Number,
    required: true,
    default: 300,
  },
  usedToday: {
    type: Number,
    required: true,
    default: 0,
  },
  sent: {
    type: Number,
    required: true,
    default: 0,
  },
  failed: {
    type: Number,
    required: true,
    default: 0,
  },
  blocked: {
    type: Number,
    required: true,
    default: 0,
  },
  lastReset: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

const EmailQuota = mongoose.model('EmailQuota', emailQuotaSchema);

export default EmailQuota;
