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
  CLOUDFLARE_TURNSTILE_SECRET_KEY: (
    process.env.TURNSTILE_SECRET_KEY || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY
  )?.trim() || '',

  // ─── Supabase Backup Storage ────────────────────────
  SUPABASE_URL: (process.env.SUPABASE_URL || 'https://optjhlvqgwupjmwtsqoe.supabase.co').trim(),
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '',

  // ─── Razorpay Payment Gateway ───────────────────────
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID?.trim() || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET?.trim() || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || '',

  // ─── AI (PDF chat) ──────────────────────────────────
  // Comma-separated lists. Provider is enabled only if it has >=1 key and >=1 model.
  AI_PROVIDER_ORDER: process.env.AI_PROVIDER_ORDER?.trim() || 'gemini,groq,openrouter',
  AI_STRATEGY: process.env.AI_STRATEGY?.trim() === 'failover' ? 'failover' : 'rotate',
  GEMINI_API_KEYS: (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY)?.trim() || '',
  GEMINI_MODELS: process.env.GEMINI_MODELS?.trim() || '',
  GROQ_API_KEYS: (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY)?.trim() || '',
  GROQ_MODELS: process.env.GROQ_MODELS?.trim() || '',
  OPENROUTER_API_KEYS: (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY)?.trim() || '',
  OPENROUTER_MODELS: process.env.OPENROUTER_MODELS?.trim() || '',
  AI_REQUEST_TIMEOUT_MS: parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10) || 15000,
  AI_CONTEXT_CHARS: parseInt(process.env.AI_CONTEXT_CHARS, 10) || 7000,
  AI_DAILY_LIMIT_PER_USER: parseInt(process.env.AI_DAILY_LIMIT_PER_USER, 10) || 40,
  AI_PER_MINUTE_LIMIT: parseInt(process.env.AI_PER_MINUTE_LIMIT, 10) || 6,
  // true (default) = same rule as the other AI endpoints: Premium only. Set to "false" for all logged-in users.
  AI_PDF_CHAT_PREMIUM_ONLY: process.env.AI_PDF_CHAT_PREMIUM_ONLY?.trim().toLowerCase() !== 'false',

  // ─── Super Admin Access Exemption ───────────────────
  SUPER_ADMIN_ID: process.env.SUPER_ADMIN_ID?.trim() || '',
  SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL?.trim() || 'abesautonomy30@gmail.com',
};

export default env;

if (env.GOOGLE_REDIRECT_URI && !env.GOOGLE_REDIRECT_URI.endsWith('/callback')) {
  console.warn(
    `⚠️ [OAuth Warning] GOOGLE_REDIRECT_URI (${env.GOOGLE_REDIRECT_URI}) does not end with '/callback'. Ensure it points to the callback route (e.g., https://api.abes.work/api/auth/google/callback).`
  );
}
