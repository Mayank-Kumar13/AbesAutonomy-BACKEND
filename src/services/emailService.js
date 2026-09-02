import env from '../config/env.js';

const sendBrevoEmail = async (toEmail, subject, text) => {
  if (!env.BREVO_API_KEY) {
    console.log(`[DEV EMAIL] To: ${toEmail} | Subject: ${subject}`);
    return;
  }

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
};

export const sendResetEmail = async (toEmail, resetLink) => {
  const subject = 'Reset your ABES Autonomy password';
  const text = `You requested a password reset.\n\nClick the link below to set a new password (valid for 30 minutes):\n${resetLink}\n\nIf you did not request this, ignore this email.`;

  console.log('[DIAGNOSTIC] Brevo SMTP send started (Reset Email)');
  try {
    await sendBrevoEmail(toEmail, subject, text);
    console.log('[DIAGNOSTIC] Brevo SMTP send succeeded (Reset Email)');
  } catch (err) {
    console.log('[DIAGNOSTIC] Brevo SMTP send failed (Reset Email):', err.message);
    throw err;
  }
};

export const sendLoginNotificationEmail = async (toEmail, { provider, time }) => {
  const subject = 'New login to your ABES Autonomy account';
  const text = `Hi,\n\nA new login to your ABES Autonomy account was just detected.\n\nMethod: ${provider}\nTime: ${time}\n\nIf this was you, no action is needed. If you don't recognize this login, please reset your password immediately.`;

  try {
    await sendBrevoEmail(toEmail, subject, text);
  } catch (err) {
    console.error('Brevo Login Notification failed:', err.message);
    throw err;
  }
};

export const sendOtpEmail = async (toEmail, otp) => {
  const subject = 'Your ABES Autonomy verification code';
  const text = `Your OTP is: ${otp}\n\nValid for 10 minutes. Do not share this code with anyone.`;

  try {
    await sendBrevoEmail(toEmail, subject, text);
  } catch (err) {
    console.error('Brevo OTP send failed:', err.message);
    throw err;
  }
};