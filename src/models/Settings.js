import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  websiteStatus: {
    type: String,
    enum: ['LIVE', 'UNDER_CONSTRUCTION'],
    default: 'UNDER_CONSTRUCTION'
  }
}, { timestamps: true });

export default mongoose.model('Settings', settingsSchema);
