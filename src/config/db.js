import mongoose from 'mongoose';
import env from './env.js';

let cachedConnection = null;

const connectDB = async () => {
  if (cachedConnection) {
    console.log('✅ Using cached MongoDB connection');
    return cachedConnection;
  }

  try {
    const conn = await mongoose.connect(env.MONGODB_URI, {
      dbName: 'abes_autonomy',
      maxPoolSize: 50,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s so the server doesn't hang
      socketTimeoutMS: 45000,
    });
    cachedConnection = conn;
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    throw error;
  }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error(`❌ MongoDB error: ${err.message}`);
});

export default connectDB;
