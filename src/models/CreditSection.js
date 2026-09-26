import mongoose from 'mongoose';

const creditSectionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Section title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

creditSectionSchema.index({ displayOrder: 1 });
creditSectionSchema.index({ isPublished: 1 });

const CreditSection = mongoose.model('CreditSection', creditSectionSchema);

export default CreditSection;
