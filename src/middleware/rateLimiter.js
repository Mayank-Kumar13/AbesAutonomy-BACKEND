import rateLimit from 'express-rate-limit';
import SuspiciousIP from '../models/SuspiciousIP.js';

const keyGenerator = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-nf-client-connection-ip'] || req.ip || 'unknown';
};

const handleSuspiciousIP = async (req, res, next, options) => {
  try {
    const ip = keyGenerator(req);
    const existing = await SuspiciousIP.findOne({ ip });
    
    if (existing) {
      existing.attemptCount += 1;
      await existing.save();
    } else {
      await SuspiciousIP.create({
        ip,
        endpoint: req.originalUrl,
        method: req.method,
        userAgent: req.headers['user-agent'] || 'unknown',
      });
    }
  } catch (error) {
    console.error('Error logging suspicious IP:', error);
  }
  
  res.status(options.statusCode).json(options.message);
};

/**
 * General API rate limiter.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: { xForwardedForHeader: false, default: true },
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
});

/**
 * Stricter rate limiter for auth endpoints.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: handleSuspiciousIP,
  validate: { xForwardedForHeader: false, default: true },
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
  },
});

/**
 * Upload rate limiter.
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: { xForwardedForHeader: false, default: true },
  message: {
    success: false,
    message: 'Upload limit reached. Please try again later.',
  },
});
