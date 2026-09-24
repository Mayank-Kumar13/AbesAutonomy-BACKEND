import mongoose from 'mongoose';

const visitorSchema = new mongoose.Schema({
  ip: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    index: true 
  },
  visitCount: { 
    type: Number, 
    default: 1 
  },
  lastVisit: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

export default mongoose.model('Visitor', visitorSchema);
