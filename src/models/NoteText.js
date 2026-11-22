import mongoose from 'mongoose';

/**
 * Cached text of a Note's PDF, pre-split into page-tagged chunks.
 * Extracted once (on first AI use) so later questions never re-download or re-parse the PDF.
 */
const noteTextSchema = new mongoose.Schema(
  {
    noteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Note',
      required: true,
      unique: true,
    },
    // Hash of the file location + extractor version; a changed PDF triggers re-extraction.
    signature: { type: String, required: true },
    status: { type: String, enum: ['ready', 'no_text'], required: true },
    pageCount: { type: Number, default: 0 },
    totalChars: { type: Number, default: 0 },
    truncated: { type: Boolean, default: false },
    // p = page number, t = chunk text (short keys keep the document small)
    chunks: { type: [{ _id: false, p: Number, t: String }], default: [] },
  },
  { timestamps: true }
);

const NoteText = mongoose.model('NoteText', noteTextSchema);
export default NoteText;
