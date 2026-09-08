import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import User from './src/models/User.js';

async function update() {
  await mongoose.connect(process.env.MONGODB_URI);
  await User.updateMany({ role: 'admin' }, { $set: { totalWatchTimeMs: 0 } });
  console.log("Admins watch time reset to 0");
  mongoose.disconnect();
}
update();
