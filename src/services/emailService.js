import env from '../config/env.js';

const getBaseHtml = (title, content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f7f6;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0,0,0,0.05);
    }
    .header {
      background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%);
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 26px;
      letter-spacing: 0.5px;
      font-weight: 700;
    }
    .content {
      padding: 40px 35px;
      color: #334155;
      line-height: 1.6;
      font-size: 16px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px;
      text-align: center;
      color: #64748b;
      font-size: 14px;
      border-top: 1px solid #e2e8f0;
    }
    .btn {
      display: inline-block;
      padding: 14px 28px;
      background-color: #4f46e5;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      margin-top: 20px;
      box-shadow: 0 4px 6px rgba(79, 70, 229, 0.2);
    }
    .otp-box {
      background-color: #f1f5f9;
      border: 2px dashed #94a3b8;
      padding: 20px;
      text-align: center;
      font-size: 36px;
      letter-spacing: 8px;
      font-weight: 800;
      color: #0f172a;
      margin: 25px 0;
      border-radius: 10px;
    }
    .highlight {
      font-weight: 600;
      color: #0f172a;
    }
    h2 {
      color: #0f172a;
      margin-top: 0;
      font-size: 22px;
    }
    p {
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>ABES Autonomy</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>This is an automated message from ABES Autonomy. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
`;

const sendBrevoEmail = async (toEmail, subject, text, html) => {
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
      textContent: text,
      htmlContent: html
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

  const htmlContent = `
    <h2>Password Reset Request</h2>
    <p>Hello,</p>
    <p>We received a request to reset the password for your ABES Autonomy account. You can set a new password by clicking the button below:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}" class="btn">Reset Password</a>
    </div>
    <p style="font-size: 14px; color: #64748b;">Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #4f46e5; font-size: 14px;">
      <a href="${resetLink}" style="color: #4f46e5;">${resetLink}</a>
    </p>
    <p>This link is valid for <strong>30 minutes</strong>.</p>
    <p style="margin-bottom: 0;">If you did not request a password reset, please safely ignore this email.</p>
  `;

  const html = getBaseHtml(subject, htmlContent);

  console.log('[DIAGNOSTIC] Brevo SMTP send started (Reset Email)');
  try {
    await sendBrevoEmail(toEmail, subject, text, html);
    console.log('[DIAGNOSTIC] Brevo SMTP send succeeded (Reset Email)');
  } catch (err) {
    console.log('[DIAGNOSTIC] Brevo SMTP send failed (Reset Email):', err.message);
    throw err;
  }
};

export const sendLoginNotificationEmail = async (toEmail, { provider, time }) => {
  const subject = 'New login to your ABES Autonomy account';
  const text = `Hi,\n\nA new login to your ABES Autonomy account was just detected.\n\nMethod: ${provider}\nTime: ${time}\n\nIf this was you, no action is needed. If you don't recognize this login, please reset your password immediately.`;

  const htmlContent = `
    <h2>New Login Detected</h2>
    <p>Hello,</p>
    <p>We noticed a new login to your ABES Autonomy account.</p>
    <div style="background-color: #f8fafc; padding: 20px; border-left: 4px solid #f59e0b; margin: 25px 0; border-radius: 4px;">
      <p style="margin: 0 0 10px 0; color: #334155;"><strong>Authentication Method:</strong> <span class="highlight">${provider}</span></p>
      <p style="margin: 0; color: #334155;"><strong>Time:</strong> <span class="highlight">${time}</span></p>
    </div>
    <p>If this was you, no further action is required.</p>
    <p style="margin-bottom: 0;">If you do <strong>not</strong> recognize this login, please reset your password immediately and contact support.</p>
  `;

  const html = getBaseHtml(subject, htmlContent);

  try {
    await sendBrevoEmail(toEmail, subject, text, html);
  } catch (err) {
    console.error('Brevo Login Notification failed:', err.message);
    throw err;
  }
};

export const sendOtpEmail = async (toEmail, otp) => {
  const subject = 'Your ABES Autonomy Verification Code';
  const text = `Your OTP is: ${otp}\n\nValid for 10 minutes. Do not share this code with anyone.`;

  const htmlContent = `
    <h2>Verification Code</h2>
    <p>Hello,</p>
    <p>Please use the verification code below to complete your authentication process. This code is valid for <strong>10 minutes</strong>.</p>
    <div class="otp-box">${otp}</div>
    <p style="margin-bottom: 0;">If you did not request this code, please ignore this email or contact support if you have concerns.</p>
  `;

  const html = getBaseHtml(subject, htmlContent);

  try {
    await sendBrevoEmail(toEmail, subject, text, html);
  } catch (err) {
    console.error('Brevo OTP send failed:', err.message);
    throw err;
  }
};

export const sendReviewAppreciationEmail = async (toEmail, userName) => {
  const subject = 'Thank You for Your Feedback! - ABES Autonomy';
  const text = `Hi ${userName},\n\nThank you for taking the time to leave a review! Your feedback helps us improve ABES Autonomy for everyone.\n\nBest regards,\nThe ABES Autonomy Team`;

  const htmlContent = `
    <h2>Thank You for Your Feedback!</h2>
    <p>Hi ${userName},</p>
    <p>We just wanted to reach out and say a huge <strong>thank you</strong> for taking the time to leave a review.</p>
    <div style="background-color: #f1f5f9; padding: 20px; margin: 25px 0; border-radius: 8px; text-align: center;">
      <p style="font-size: 18px; color: #4f46e5; margin: 0; font-weight: 600;">Your feedback means the world to us! 🌟</p>
    </div>
    <p>Every review helps us understand what we're doing right and where we can improve ABES Autonomy for all students.</p>
    <p style="margin-bottom: 0;">Best regards,<br><strong>The ABES Autonomy Team</strong></p>
  `;

  const html = getBaseHtml(subject, htmlContent);

  try {
    await sendBrevoEmail(toEmail, subject, text, html);
  } catch (err) {
    console.error('Brevo Review Appreciation Email failed:', err.message);
    // Don't throw to prevent breaking the review flow
  }
};