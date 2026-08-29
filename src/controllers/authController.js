import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User.js';
import OtpToken from '../models/OtpToken.js';
import LoginLog from '../models/LoginLog.js';
import ApiResponse from '../utils/ApiResponse.js';
import { generateToken } from '../middleware/auth.js';
import { sendLoginNotificationEmail, sendOtpEmail } from '../services/emailService.js';

const MAX_ATTEMPTS = 5;
const OTP_TTL_MS = 10 * 60 * 1000;

const generateOtp = () => String(crypto.randomInt(100000, 999999));

const issueOtp = async (userId, email, purpose) => {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  await OtpToken.deleteMany({ userId, purpose });
  await OtpToken.create({
    userId,
    otpHash,
    purpose,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });
  sendOtpEmail(email, otp).catch((err) => console.error('OTP email failed:', err.message));
};

/**
 * POST /api/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return ApiResponse.badRequest(res, 'An account with this email already exists.');
    }

    const user = await User.create({ name, email, password, emailVerified: false });
    await issueOtp(user._id, user.email, 'signup');

    return ApiResponse.created(
      res,
      { userId: user._id, email: user.email, purpose: 'signup' },
      'OTP sent to your email. Please verify to complete signup.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return ApiResponse.unauthorized(res, 'Invalid email or password.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return ApiResponse.unauthorized(res, 'Invalid email or password.');
    }

    const purpose = user.emailVerified ? 'login' : 'signup';
    await issueOtp(user._id, user.email, purpose);

    return ApiResponse.success(
      res,
      { userId: user._id, email: user.email, purpose },
      'OTP sent to your email. Please verify to continue.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/verify-otp
 * body: { userId, otp, purpose: 'signup' | 'login' }
 */
export const verifyOtp = async (req, res, next) => {
  try {
    const { userId, otp } = req.body;
    const purpose = req.body.purpose === 'login' ? 'login' : 'signup';

    const record = await OtpToken.findOne({ userId, purpose }).sort({ createdAt: -1 });
    if (!record) {
      return ApiResponse.badRequest(res, 'OTP expired or not found. Please request a new one.');
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await OtpToken.deleteOne({ _id: record._id });
      return ApiResponse.badRequest(res, 'Too many incorrect attempts. Request a new OTP.');
    }

    const isMatch = await bcrypt.compare(otp, record.otpHash);
    if (!isMatch) {
      record.attempts += 1;
      await record.save();
      const attemptsLeft = MAX_ATTEMPTS - record.attempts;
      return ApiResponse.badRequest(
        res,
        attemptsLeft > 0
          ? `Invalid OTP. ${attemptsLeft} attempt(s) left.`
          : 'Invalid OTP. Request a new one.'
      );
    }

    await OtpToken.deleteOne({ _id: record._id });

    const user = await User.findById(userId);
    if (!user) {
      return ApiResponse.badRequest(res, 'User not found.');
    }

    if (purpose === 'signup') {
      user.emailVerified = true;
    }
    user.lastLogin = new Date();
    user.lastActiveAt = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    await LoginLog.create({
      userId: user._id,
      name: user.name,
      email: user.email,
      provider: 'email',
      ip: req.ip || '',
    });

    const token = generateToken(user);

    if (purpose === 'login') {
      sendLoginNotificationEmail(user.email, {
        provider: 'Email/Password',
        time: new Date().toLocaleString(),
      }).catch((err) => console.error('Login email failed:', err.message));
    }

    return ApiResponse.success(
      res,
      { user: user.toSafeJSON(), token },
      purpose === 'signup' ? 'Email verified successfully' : 'Login successful'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/resend-otp
 * body: { userId, purpose: 'signup' | 'login' }
 */
export const resendOtp = async (req, res, next) => {
  try {
    const { userId } = req.body;
    const purpose = req.body.purpose === 'login' ? 'login' : 'signup';

    const user = await User.findById(userId);
    if (!user) {
      return ApiResponse.badRequest(res, 'Invalid request.');
    }
    if (purpose === 'signup' && user.emailVerified) {
      return ApiResponse.badRequest(res, 'Account already verified.');
    }

    await issueOtp(user._id, user.email, purpose);

    return ApiResponse.success(res, null, 'OTP resent to your email.');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/profile
 */
export const getProfile = async (req, res) => {
  return ApiResponse.success(res, req.user.toSafeJSON());
};

/**
 * PATCH /api/auth/profile
 */
export const updateProfile = async (req, res, next) => {
  try {
    const allowedFields = ['name', 'mobile', 'email'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (updates.email && updates.email !== req.user.email) {
      const existing = await User.findOne({ email: updates.email });
      if (existing) {
        return ApiResponse.badRequest(res, 'Email is already in use.');
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    return ApiResponse.success(res, user.toSafeJSON(), 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};