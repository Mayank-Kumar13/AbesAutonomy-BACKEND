import dotenv from 'dotenv';
dotenv.config();

const requiredVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'IMAGEKIT_PUBLIC_KEY',
  'IMAGEKIT_PRIVATE_KEY',
  'IMAGEKIT_URL_ENDPOINT',
];

for (const varName of requiredVars) {
  if (!process.env[varName] || process.env[varName].trim() === '') {
    console.error(`❌ Missing required environment variable: ${varName}`);
    process.exit(1);
  }
}

if (process.env.IMAGEKIT_PRIVATE_KEY === 'your-imagekit-private-key') {
  console.error(`❌ IMAGEKIT_PRIVATE_KEY still has the placeholder value. Please configure it in .env`);
  process.exit(1);
}

const env = {
  MONGODB_URI: process.env.MONGODB_URI?.trim(),
  JWT_SECRET: process.env.JWT_SECRET?.trim(),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN?.trim() || '7d',
  IMAGEKIT_PUBLIC_KEY: process.env.IMAGEKIT_PUBLIC_KEY?.trim() || '',
  IMAGEKIT_PRIVATE_KEY: process.env.IMAGEKIT_PRIVATE_KEY?.trim() || '',
  IMAGEKIT_URL_ENDPOINT: process.env.IMAGEKIT_URL_ENDPOINT?.trim() || '',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  NODE_ENV: process.env.NODE_ENV?.trim() || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL?.trim() || 'http://localhost:5173',
  BACKEND_URL: process.env.BACKEND_URL?.trim() || 'http://localhost:5000',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID?.trim() || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
  GOOGLE_REDIRECT_URI:
    process.env.GOOGLE_REDIRECT_URI?.trim() || 'http://localhost:5000/api/auth/google/callback',

  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID?.trim() || '',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET?.trim() || '',
  GITHUB_REDIRECT_URI:
    process.env.GITHUB_REDIRECT_URI?.trim() || 'http://localhost:5000/api/auth/github/callback',

  SMTP_HOST: process.env.SMTP_HOST?.trim() || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER: process.env.SMTP_USER?.trim() || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD?.trim() || '',
  SMTP_FROM: process.env.SMTP_FROM?.trim() || 'no-reply@abesautonomy.local',
  RESEND_API_KEY: process.env.RESEND_API_KEY?.trim() || '',
  BREVO_API_KEY: process.env.BREVO_API_KEY?.trim() || '',
};

export default env;