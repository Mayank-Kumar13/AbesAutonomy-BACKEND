import serverless from 'serverless-http';
import app from '../../src/app.js';
import connectDB from '../../src/config/db.js';

// Initialize the database connection
connectDB().catch(console.error);

export const handler = serverless(app);
