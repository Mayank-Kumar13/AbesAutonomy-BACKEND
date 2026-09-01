import crypto from 'crypto';
import User from '../models/User.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import ApiResponse from '../utils/ApiResponse.js';
import env from '../config/env.js';
import { sendResetEmail } from '../services/emailService.js';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * POST /api/auth/forgot-password
 */
export const forgotPassword = async (req, res, next) => {
  try {
    console.log('[DIAGNOSTIC] Forgot password controller reached');
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);

      await PasswordResetToken.create({
        userId: user._id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const resetLink = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
      await sendResetEmail(user.email, resetLink);
    }

    return ApiResponse.success(res, null, 'If that email exists, a reset link has been sent');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/reset-password
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const tokenHash = hashToken(token);

    const resetToken = await PasswordResetToken.findOne({ tokenHash });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return ApiResponse.badRequest(res, 'Invalid or expired token');
    }

    const user = await User.findById(resetToken.userId);
    if (!user) {
      return ApiResponse.badRequest(res, 'Invalid or expired token');
    }

    user.password = newPassword; // pre-save hook hashes it
    await user.save();

    resetToken.used = true;
    await resetToken.save();

    return ApiResponse.success(res, null, 'Password reset successful');
  } catch (error) {
    next(error);
  }
};