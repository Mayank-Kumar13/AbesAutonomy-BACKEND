import { Resend } from 'resend';
import env from '../config/env.js';

// Initialize Resend client with a dummy key if not present (to prevent throw in dev/test)
const resend = new Resend(env.RESEND_API_KEY || 're_123');

export const sendResetEmail = async (toEmail, resetLink) => {
  const subject = 'Reset your ABES Autonomy password';
  const text = `You requested a password reset.\n\nClick the link below to set a new password (valid for 30 minutes):\n${resetLink}\n\nIf you did not request this, ignore this email.`;

  if (!env.RESEND_API_KEY) {
    console.log(`[DEV EMAIL] To: ${toEmail} | Subject: ${subject}`);
    return;
  }

  console.log('[DIAGNOSTIC] SMTP send started (Reset Email)');
  try {
    const { data, error } = await resend.emails.send({
      from: env.SMTP_FROM,
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
    console.log(`[DEV EMAIL] To: ${toEmail} | Subject: ${subject}`);
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: env.SMTP_FROM,
      to: toEmail,
      subject,
      text,
    });

    if (error) {
      throw error;
    }
  } catch (err) {
    throw err;
  }
};

export const sendOtpEmail = async (toEmail, otp) => {
  const subject = 'Your ABES Autonomy verification code';
  const text = `Your OTP is: ${otp}\n\nValid for 10 minutes. Do not share this code with anyone.`;

  // Try Brevo first (preferred for OTP)
  if (env.BREVO_API_KEY) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': env.BREVO_API_KEY
        },
        body: JSON.stringify({
          sender: { email: env.SMTP_FROM, name: 'ABES Autonomy' },
          to: [{ email: toEmail }],
          subject,
          textContent: text
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`Brevo API Error: ${response.status} ${errData.message || ''}`);
      }
      return; // Brevo succeeded
    } catch (err) {
      console.error('Brevo OTP send failed, trying Resend fallback:', err.message);
      // Fall through to Resend
    }
  }

  // Fallback to Resend (already configured on production)
  if (env.RESEND_API_KEY) {
    try {
      const { data, error } = await resend.emails.send({
        from: env.SMTP_FROM,
        to: toEmail,
        subject,
        text,
      });

      if (error) {
        throw error;
      }
      return; // Resend succeeded
    } catch (err) {
      console.error('Resend OTP send failed:', err.message);
      throw err;
    }
  }

  // Neither provider configured — dev/test mode
  console.log(`[DEV EMAIL] OTP requested for ${toEmail} (OTP not logged in production).`);
};