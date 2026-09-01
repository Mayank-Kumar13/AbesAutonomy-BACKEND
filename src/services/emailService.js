import nodemailer from 'nodemailer';
import env from '../config/env.js';

const getTransporter = () => {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
    family: 4, // Force IPv4 to prevent ENETUNREACH in Render
  });
};

export const sendResetEmail = async (toEmail, resetLink) => {
  const subject = 'Reset your ABES Autonomy password';
  const text = `You requested a password reset.\n\nClick the link below to set a new password (valid for 30 minutes):\n${resetLink}\n\nIf you did not request this, ignore this email.`;

  if (!env.SMTP_HOST) {
    console.log(`[DEV EMAIL] To: ${toEmail}\n${text}`);
    return;
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: toEmail,
    subject,
    text,
  });
};

export const sendLoginNotificationEmail = async (toEmail, { provider, time }) => {
  const subject = 'New login to your ABES Autonomy account';
  const text = `Hi,\n\nA new login to your ABES Autonomy account was just detected.\n\nMethod: ${provider}\nTime: ${time}\n\nIf this was you, no action is needed. If you don't recognize this login, please reset your password immediately.`;

  if (!env.SMTP_HOST) {
    console.log(`[DEV EMAIL] To: ${toEmail}\n${text}`);
    return;
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: toEmail,
    subject,
    text,
  });
};

export const sendOtpEmail = async (toEmail, otp) => {
  const subject = 'Your ABES Autonomy verification code';
  const text = `Your OTP is: ${otp}\n\nValid for 10 minutes. Do not share this code with anyone.`;

  if (!env.SMTP_HOST) {
    console.log(`[DEV EMAIL] To: ${toEmail}\n${text}`);
    return;
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: toEmail,
    subject,
    text,
  });
};