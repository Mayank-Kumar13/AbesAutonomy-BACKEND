import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  websiteStatus: {
    type: String,
    enum: ['LIVE', 'UNDER_CONSTRUCTION'],
    default: 'LIVE'
  },
  announcement: {
    message: { type: String, default: '' },
    active: { type: Boolean, default: false },
    reactions: { type: Number, default: 0 }
  },
  ads: {
    enabled: { type: Boolean, default: true },
    clientId: { type: String, default: 'ca-pub-9991688552602855' },
    leftSlotId: { type: String, default: '' },
    rightSlotId: { type: String, default: '' },
    mobileSlotId: { type: String, default: '' },
    hideForPremium: { type: Boolean, default: true },
    showSetupPlaceholders: { type: Boolean, default: false }
  }
}, { timestamps: true });

export default mongoose.model('Settings', settingsSchema);
