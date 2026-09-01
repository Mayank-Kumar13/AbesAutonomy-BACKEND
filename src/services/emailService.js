import { Resend } from 'resend';
import env from '../config/env.js';

// Initialize Resend client
const resend = new Resend(env.RESEND_API_KEY);

export const sendResetEmail = async (toEmail, resetLink) => {
  const subject = 'Reset your ABES Autonomy password';
  const text = `You requested a password reset.\n\nClick the link below to set a new password (valid for 30 minutes):\n${resetLink}\n\nIf you did not request this, ignore this email.`;

  if (!env.RESEND_API_KEY) {
    console.log(`[DEV EMAIL] To: ${toEmail}\n${text}`);
    return;
  }

  console.log('[DIAGNOSTIC] SMTP send started (Reset Email)');
  try {
    const { data, error } = await resend.emails.send({
      from: env.SMTP_FROM, // Note: Resend requires this to be a verified domain or 'onboarding@resend.dev' for testing
      to: toEmail,
      subject,
      text,
    });

    if (error) {
      throw error;
    }

    console.log('[DIAGNOSTIC] SMTP send succeeded (Reset Email)');
  } catch (err) {
    console.log('[DIAGNOSTIC] SMTP send failed (Reset Email):', err.message);
    throw err;
  }
};

export const sendLoginNotificationEmail = async (toEmail, { provider, time }) => {
  const subject = 'New login to your ABES Autonomy account';
  const text = `Hi,\n\nA new login to your ABES Autonomy account was just detected.\n\nMethod: ${provider}\nTime: ${time}\n\nIf this was you, no action is needed. If you don't recognize this login, please reset your password immediately.`;

  if (!env.RESEND_API_KEY) {
    console.log(`[DEV EMAIL] To: ${toEmail}\n${text}`);
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: env.SMTP_FROM, // Note: Resend requires this to be a verified domain or 'onboarding@resend.dev' for testing
      to: toEmail,
      subject,
      text,
    });

    if (error) {
      throw error;
    }
  } catch (err) {
    // In original code there was no try/catch here, but it was unhandled or handled in caller.
    // Wait, the original code had:
    // await transporter.sendMail(...)
    // I should just throw the error or let it propagate.
    throw err;
  }
};

export const sendOtpEmail = async (toEmail, otp) => {
  console.log('[DIAGNOSTIC] OTP email function called');
  const subject = 'Your ABES Autonomy verification code';
  const text = `Your OTP is: ${otp}\n\nValid for 10 minutes. Do not share this code with anyone.`;

  if (!env.RESEND_API_KEY) {
    console.log(`[DEV EMAIL] To: ${toEmail}\n${text}`);
    return;
  }

  console.log('[DIAGNOSTIC] SMTP send started (OTP Email)');
  try {
    const { data, error } = await resend.emails.send({
      from: env.SMTP_FROM, // Note: Resend requires this to be a verified domain or 'onboarding@resend.dev' for testing
      to: toEmail,
      subject,
      text,
    });

    if (error) {
      throw error;
    }

    console.log('[DIAGNOSTIC] SMTP send succeeded (OTP Email)');
  } catch (err) {
    console.log('[DIAGNOSTIC] SMTP send failed (OTP Email):', err.message);
    throw err;
  }
};