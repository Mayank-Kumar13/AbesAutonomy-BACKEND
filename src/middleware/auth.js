import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import User from '../models/User.js';
import ApiResponse from '../utils/ApiResponse.js';

/**
 * Verify JWT token and attach user to request.
 * Required auth — rejects if no valid token.
 */
export const requireAuth = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const extractedToken = authHeader.split(' ')[1];
      if (extractedToken && extractedToken !== 'null' && extractedToken !== 'undefined') {
        token = extractedToken;
      }
    }
    
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token && req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return ApiResponse.unauthorized(res, 'Access denied. No token provided.');
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return ApiResponse.unauthorized(res, 'User no longer exists.');
    }

    // Single Active Device Enforcement:
    // If user has an active session recorded, verify this token matches the active session.
    if (user.currentSessionId && decoded.sessionId !== user.currentSessionId) {
      return ApiResponse.unauthorized(
        res,
        'Your account has been logged in on another device. You have been logged out on this device.',
        { code: 'CONCURRENT_SESSION_LOGOUT' }
      );
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return ApiResponse.unauthorized(res, 'Invalid token.');
    }
    if (error.name === 'TokenExpiredError') {
      return ApiResponse.unauthorized(res, 'Token expired.');
    }
    return ApiResponse.error(res, 'Authentication error.');
  }
};

/**
 * Optional auth — attaches user if token exists, but doesn't reject.
 */
export const optionalAuth = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const extractedToken = authHeader.split(' ')[1];
      if (extractedToken && extractedToken !== 'null' && extractedToken !== 'undefined') {
        token = extractedToken;
      }
    }
    
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token && req.query && req.query.token) {
      token = req.query.token;
    }

    if (token) {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user) {
        if (!user.currentSessionId || decoded.sessionId === user.currentSessionId) {
          req.user = user;
        }
      }
    }
  } catch {
    // Silently ignore — optional auth
  }
  next();
};

/**
 * Require admin role.
 * Must be used AFTER requireAuth.
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return ApiResponse.forbidden(res, 'Admin access required.');
  }
  next();
};

/**
 * Require admin or coordinator role.
 * Must be used AFTER requireAuth.
 */
export const requireAdminOrCoordinator = (req, res, next) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'coordinator')) {
    return ApiResponse.forbidden(res, 'Admin or Coordinator access required.');
  }
  next();
};

/**
 * Generate JWT token for a user with active device session tracking.
 */
export const generateToken = (user, sessionId = null) => {
  const activeSessionId = sessionId || user.currentSessionId || null;
  const payload = { id: user._id, role: user.role };
  if (activeSessionId) {
    payload.sessionId = activeSessionId;
  }
  return jwt.sign(
    payload,
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
};
