import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './config/env.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import errorHandler from './middleware/errorHandler.js';
import cookieParser from 'cookie-parser';

// Route imports
import noteRoutes from './routes/noteRoutes.js';
import authRoutes from './routes/authRoutes.js';
import oauthRoutes from './routes/oauthRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import metaRoutes from './routes/metaRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import trackingRoutes from './routes/trackingRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import activityRoutes from './routes/activityRoutes.js';

const app = express();

// ─── Render / Reverse Proxy ──────────────────────────
app.set('trust proxy', true);

// ─── Security middleware ─────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    frameguard: {
      action: 'deny'
    },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },
    xContentTypeOptions: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://ik.imagekit.io"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  })
);

// ─── CORS ─────────────────────────────────────────────
const allowedOrigins = [
  'https://abes.work',
  'https://www.abes.work',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
];

if (env.FRONTEND_URL) {
  try {
    const parsedOrigin = new URL(env.FRONTEND_URL).origin;
    if (!allowedOrigins.includes(parsedOrigin)) allowedOrigins.push(parsedOrigin);
  } catch {
    if (!allowedOrigins.includes(env.FRONTEND_URL)) allowedOrigins.push(env.FRONTEND_URL);
  }
}

const isOriginAllowed = (origin) => {
  if (!origin) return true; // Direct API calls, mobile, curl, health checks
  if (allowedOrigins.includes(origin)) return true;
  // Allow all Vercel deployments (production & preview links)
  if (origin.endsWith('.vercel.app')) return true;
  // Allow any subdomains of abes.work
  if (origin.endsWith('.abes.work')) return true;
  // Allow local dev ports
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      // Return false to gracefully block unauthorized origin without throwing a 500 server error
      return callback(null, false);
    },

    credentials: true,

    methods: [
      'GET',
      'POST',
      'PATCH',
      'PUT',
      'DELETE',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Range',
      'Accept',
    ],
  })
);

// ─── Body parsing ────────────────────────────────────
app.use(
  express.json({
    limit: '10mb',
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '10mb',
  })
);

app.use(cookieParser());

// ─── Custom MongoDB query sanitization ───────────────
const sanitize = (obj) => {
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    }
  }

  return obj;
};

app.use((req, res, next) => {
  if (req.body) {
    sanitize(req.body);
  }

  next();
});

// ─── Rate limiting ───────────────────────────────────
app.use('/api', apiLimiter);

// ─── Health check ────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const { isSupabaseConfigured, getSupabase } = await import('./config/supabase.js');
  res.json({
    success: true,
    message: 'ABES Autonomy API is running',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    supabase: {
      configured: isSupabaseConfigured(),
      hasUrl: Boolean(env.SUPABASE_URL),
      hasServiceRoleKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      hasPublishableKey: Boolean(env.SUPABASE_PUBLISHABLE_KEY),
    },
  });
});

// ─── API Routes ──────────────────────────────────────

import settingsRoutes from './routes/settingsRoutes.js';
import subjectRoutes from './routes/subjectRoutes.js';
import creditsRoutes from './routes/creditsRoutes.js';

app.use('/api/notes', noteRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/auth', oauthRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reader', trackingRoutes);
app.use('/api/tracking', trackingRoutes); // Fallback for cached clients
app.use('/api/activity', activityRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/credits', creditsRoutes);

import analyticsRoutes from './routes/analyticsRoutes.js';
app.use('/api/analytics', analyticsRoutes);

// ─── 404 handler ─────────────────────────────────────
app.use('/api/{*path}', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

//───Globalerror handler(must be last)─────────────
app.use(errorHandler);

export default app;