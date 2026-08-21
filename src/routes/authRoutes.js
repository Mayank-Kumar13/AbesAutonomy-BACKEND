import { Router } from 'express';
import {
  register,
  login,
  getProfile,
  updateProfile,
  verifyOtp,
  resendOtp,
} from '../controllers/authController.js';
import {
  forgotPassword,
  resetPassword,
} from '../controllers/passwordResetController.js';
import { requireAuth } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import {
  registerValidation,
  loginValidation,
  updateProfileValidation,
  otpVerifyValidation,
  otpResendValidation,
} from '../validators/authValidator.js';
import {
  forgotPasswordValidation,
  resetPasswordValidation,
} from '../validators/passwordResetValidator.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// ─── Public routes ────────────────────────────────────
router.post('/register', authLimiter, registerValidation, validate, register);
router.post('/login', authLimiter, loginValidation, validate, login);
router.post('/verify-otp', authLimiter, otpVerifyValidation, validate, verifyOtp);
router.post('/resend-otp', authLimiter, otpResendValidation, validate, resendOtp);
router.post('/forgot-password', authLimiter, forgotPasswordValidation, validate, forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidation, validate, resetPassword);

// ─── Protected routes ─────────────────────────────────
router.get('/profile', requireAuth, getProfile);
router.patch('/profile', requireAuth, updateProfileValidation, validate, updateProfile);

export default router;