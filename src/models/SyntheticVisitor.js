import mongoose from 'mongoose';

const syntheticVisitorSchema = new mongoose.Schema({
  syntheticId: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    index: true 
  },
  ip: {
    type: String,
    required: false
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

export default mongoose.model('SyntheticVisitor', syntheticVisitorSchema);
