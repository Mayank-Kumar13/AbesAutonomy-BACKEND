import mongoose from 'mongoose';

const aiUsageLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userEmail: {
      type: String,
      default: '',
    },
    userName: {
      type: String,
      default: '',
    },
    feature: {
      type: String,
      required: true,
      index: true,
    },
    tokensUsed: {
      type: Number,
      default: 0,
    },
    promptSnippet: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'blocked'],
      default: 'success',
    },
    ip: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

aiUsageLogSchema.index({ createdAt: -1 });

const AIUsageLog = mongoose.model('AIUsageLog', aiUsageLogSchema);
export default AIUsageLog;
