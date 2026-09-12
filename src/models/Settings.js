import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  websiteStatus: {
    type: String,
    enum: ['LIVE', 'UNDER_CONSTRUCTION'],
    default: 'LIVE'
  }
}, { timestamps: true });

export default mongoose.model('Settings', settingsSchema);
