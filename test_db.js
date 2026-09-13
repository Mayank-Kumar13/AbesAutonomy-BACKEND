import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import PdfViewLog from './src/models/PdfViewLog.js';

async function checkDB() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");
  
  try {
    const newLog = await PdfViewLog.create({
      user: new mongoose.Types.ObjectId(),
      userName: "Test User",
      userEmail: "test@example.com",
      pdfId: "http://example.com/pdf",
      pdfTitle: "Computer Networks",
      startTime: new Date(),
      endTime: new Date(),
      durationMs: 0
    });
    console.log("Created successfully:", newLog);
  } catch (error) {
    console.error("Error creating log:", error);
  }
  
  process.exit(0);
}

checkDB();
