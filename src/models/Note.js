import mongoose from 'mongoose';

const RESOURCE_TYPES = ['theory', 'assignment', 'lab_manual', 'pyq', 'handwritten', 'syllabus'];
const BRANCHES = ['electrical', 'electronics', 'common'];

const noteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      uppercase: true,
    },
    branch: {
      type: String,
      required: [true, 'Branch is required'],
      enum: {
        values: BRANCHES,
        message: 'Branch must be one of: ' + BRANCHES.join(', '),
      },
      lowercase: true,
    },
    year: {
      type: Number,
      required: [true, 'Year is required'],
      min: [1, 'Year must be between 1 and 4'],
      max: [4, 'Year must be between 1 and 4'],
    },
    semester: {
      type: Number,
      min: [1, 'Semester must be between 1 and 8'],
      max: [8, 'Semester must be between 1 and 8'],
    },
    resourceType: {
      type: String,
      required: [true, 'Resource type is required'],
      enum: {
        values: RESOURCE_TYPES,
        message: 'Resource type must be one of: ' + RESOURCE_TYPES.join(', '),
      },
      lowercase: true,
    },
    unit: {
      type: Number,
      min: [1, 'Unit must be between 1 and 10'],
      max: [10, 'Unit must be between 1 and 10'],
    },
    university: {
      type: String,
      trim: true,
      default: 'ABES Engineering College',
    },
    tags: {
      type: [String],
      default: [],
    },

    // ─── ImageKit fields ────────────────────────────
    pdfUrl: {
      type: String,
      required: [true, 'PDF URL is required'],
    },
    imagekitFileId: {
      type: String,
      default: '',
    },
    imagekitFilePath: {
      type: String,
      default: '',
    },
    thumbnailUrl: {
      type: String,
      default: '',
    },

    // ─── Metadata ───────────────────────────────────
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────
// Primary compound index for the main filter query
noteSchema.index({ branch: 1, year: 1, resourceType: 1, subject: 1 });

// Subject + unit lookup
noteSchema.index({ subject: 1, unit: 1 });

// Published filter
noteSchema.index({ isPublished: 1 });

// Text search index
noteSchema.index(
  { title: 'text', description: 'text', subject: 'text', tags: 'text' },
  { weights: { title: 10, subject: 5, tags: 3, description: 1 } }
);

// ─── Statics ──────────────────────────────────────────
noteSchema.statics.RESOURCE_TYPES = RESOURCE_TYPES;
noteSchema.statics.BRANCHES = BRANCHES;

const Note = mongoose.model('Note', noteSchema);

export default Note;
export { RESOURCE_TYPES, BRANCHES };
