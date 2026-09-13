import mongoose from 'mongoose';

const pdfViewLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    userName: {
      type: String,
      required: true,
    },
    userEmail: {
      type: String,
      required: true,
    },
    pdfId: {
      type: String,
      default: null,
    },
    pdfTitle: {
      type: String,
      required: true,
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: Date.now,
    },
    durationMs: {
      type: Number,
      default: 0,
    }
  },
  {
    timestamps: true,
  }
);

// Optional: Index to quickly find recent logs by the same user and PDF
pdfViewLogSchema.index({ user: 1, pdfTitle: 1, endTime: -1 });

const PdfViewLog = mongoose.model('PdfViewLog', pdfViewLogSchema);

export default PdfViewLog;
