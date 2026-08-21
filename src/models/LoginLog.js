import mongoose from 'mongoose';

const loginLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    provider: { type: String, default: 'email' },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

const LoginLog = mongoose.model('LoginLog', loginLogSchema);
export default LoginLog;