import rateLimit from 'express-rate-limit';
import SuspiciousIP from '../models/SuspiciousIP.js';

const keyGenerator = (req) => {
  // express 'trust proxy' already handles x-forwarded-for securely and populates req.ip
  // Using custom parsing of x-forwarded-for can be vulnerable to IP spoofing if not careful.
  return req.ip || req.headers['x-nf-client-connection-ip'] || 'unknown';
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

/**
 * 1-Hour strict rate limiter specifically for Forgot Password (by IP).
 */
export const forgotPasswordIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1, // Only 1 request per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: async (req, res, next, options) => {
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
      console.error('Error logging suspicious IP in forgot password limiter:', error);
    }
    
    res.status(429).json({
      success: false,
      message: 'nice try bitch. Please try again after 1 hour.'
    });
  },
  validate: { xForwardedForHeader: false, default: true }
});

/**
 * 1-Hour strict rate limiter specifically for Forgot Password (by Email).
 * This prevents attackers from rotating IPs to spam the same email address.
 */
export const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1, // Only 1 request per hour per Email
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.body.email ? req.body.email.toLowerCase() : 'unknown-email';
  },
  handler: (req, res, next, options) => {
    res.status(429).json({
      success: false,
      message: 'nice try bitch. Password reset already requested for this email. Please try again after 1 hour.'
    });
  },
  validate: { xForwardedForHeader: false, default: true }
});
