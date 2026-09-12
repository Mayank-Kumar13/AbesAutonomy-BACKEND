import mongoose from 'mongoose';

const emailLogSchema = new mongoose.Schema({
  recipient: {
    type: String,
    required: true,
    index: true,
  },
  subject: {
    type: String,
    required: true,
  },
  template: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['SENT', 'FAILED', 'QUOTA_EXCEEDED', 'EXPIRED', 'PENDING'],
    index: true,
  },
  messageId: {
    type: String,
    sparse: true,
    index: true,
  },
  errorReason: {
    type: String,
  },
  sentAt: {
    type: Date,
  },
  expiredAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

const EmailLog = mongoose.model('EmailLog', emailLogSchema);

export default EmailLog;
