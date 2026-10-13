import rateLimit from 'express-rate-limit';
import SuspiciousIP from '../models/SuspiciousIP.js';

const keyGenerator = (req) => {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  return req.ip || req.headers['x-nf-client-connection-ip'] || 'unknown';
};

// IP blocking and aggressive rate limiting removed to prevent blocking legitimate students on shared campus networks.

export const apiLimiter = (req, res, next) => next();

export const authLimiter = (req, res, next) => next();

export const captchaLimiter = (req, res, next) => next();

export const uploadLimiter = (req, res, next) => next();

export const searchLimiter = (req, res, next) => next();

export const viewCounterLimiter = (req, res, next) => next();

export const forgotPasswordLimiter = (req, res, next) => next();

