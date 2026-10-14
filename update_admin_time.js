import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import User from './src/models/User.js';

async function update() {
  await mongoose.connect(process.env.MONGODB_URI);
  await User.updateMany({ email: 'abesautonomy30@gmail.com' }, { $set: { totalWatchTimeMs: 0 } });
  console.log("Master admin watch time reset to 0");
  mongoose.disconnect();
}
update();
