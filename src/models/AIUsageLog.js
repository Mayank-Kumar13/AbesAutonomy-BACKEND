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
    // Set by AI features that call a real model (e.g. pdf_chat)
    provider: {
      type: String,
      default: '',
    },
    model: {
      type: String,
      default: '',
    },
    noteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Note',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

aiUsageLogSchema.index({ createdAt: -1 });
// Used for per-user daily limits
aiUsageLogSchema.index({ userId: 1, feature: 1, createdAt: -1 });

const AIUsageLog = mongoose.model('AIUsageLog', aiUsageLogSchema);
export default AIUsageLog;
