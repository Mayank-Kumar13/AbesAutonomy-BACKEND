import serverless from 'serverless-http';
import app from '../../src/app.js';
import connectDB from '../../src/config/db.js';

export const handler = async (event, context) => {
  // Ensure we are connected to the database before handling the request
  await connectDB();
  const serverlessHandler = serverless(app, {
    binary: ['application/pdf', 'image/*']
  });
  return serverlessHandler(event, context);
};
