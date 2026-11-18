import mongoose from 'mongoose';

const pdfAccessLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
    noteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Note',
      required: true,
      index: true,
    },
    noteTitle: {
      type: String,
      default: '',
    },
    subject: {
      type: String,
      default: '',
    },
    resourceType: {
      type: String,
      default: '',
    },
    accessType: {
      type: String,
      enum: ['free_allowance', 'premium_subscription', 'super_admin', 'pyq_free', 'blocked'],
      required: true,
    },
    allowed: {
      type: Boolean,
      required: true,
      index: true,
    },
    ip: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

pdfAccessLogSchema.index({ createdAt: -1 });
pdfAccessLogSchema.index({ userId: 1, noteId: 1 });

const PDFAccessLog = mongoose.model('PDFAccessLog', pdfAccessLogSchema);
export default PDFAccessLog;
