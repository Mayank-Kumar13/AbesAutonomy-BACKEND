import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
      maxlength: [100, 'Subject name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    year: {
      type: Number,
      required: [true, 'Year is required'],
      enum: [1, 2, 3, 4],
    },
    group: {
      type: [{
        type: String,
        trim: true,
        lowercase: true,
      }],
      default: ['common'],
    },
    icon: {
      type: String,
      trim: true,
      default: 'BookOpen', // default Lucide icon name fallback
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster querying
subjectSchema.index({ year: 1, group: 1, isActive: 1 });
subjectSchema.index({ displayOrder: 1 });

const Subject = mongoose.model('Subject', subjectSchema);

export default Subject;
