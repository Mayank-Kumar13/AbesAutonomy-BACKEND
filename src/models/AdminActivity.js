import mongoose from 'mongoose';

const adminActivitySchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    adminName: {
      type: String,
      required: true,
    },
    adminEmail: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'DELETE_USER',
        'UPDATE_ROLE',
        'CLEAR_LOGS',
        'DELETE_REVIEW',
        'UPLOAD_NOTE',
        'UPDATE_NOTE',
        'DELETE_NOTE',
        'CHANGE_STATUS',
        'OTHER',
      ],
    },
    details: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // Will add createdAt and updatedAt
  }
);

const AdminActivity = mongoose.model('AdminActivity', adminActivitySchema);
export default AdminActivity;
