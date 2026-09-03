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
import adminRoutes from './routes/adminRoutes.js';
import activityRoutes from './routes/activityRoutes.js';

const app = express();

// ─── Render / Reverse Proxy ──────────────────────────
app.set('trust proxy', 1);

// ─── Security middleware ─────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  })
);

// ─── CORS ─────────────────────────────────────────────
const allowedOrigins = [
  'https://abes.work',
  'https://www.abes.work',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin
      // (Postman, server-to-server, mobile apps, etc.)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
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
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'ABES Autonomy API is running',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// ─── API Routes ──────────────────────────────────────
app.use((req, res, next) => {
  console.log(
    `[DIAGNOSTIC] ${req.method} ${req.originalUrl} - ${new Date().toISOString()}`
  );

  next();
});

import settingsRoutes from './routes/settingsRoutes.js';

app.use('/api/notes', noteRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/auth', oauthRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/settings', settingsRoutes);

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