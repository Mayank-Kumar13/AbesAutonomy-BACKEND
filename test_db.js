import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import PdfViewLog from './src/models/PdfViewLog.js';

async function checkDB() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'abes_autonomy' });
  console.log("Connected to MongoDB.");
  
  try {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    const logs = await PdfViewLog.find({ updatedAt: { $gte: thirtyMinsAgo } });
    console.log("Logs in last 30 mins:", logs.length);
    if (logs.length > 0) {
      console.log("Latest Log:", logs[logs.length - 1]);
    }
  } catch (error) {
    console.error("Error querying logs:", error);
  }
  
  process.exit(0);
}

checkDB();
